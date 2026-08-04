import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type {
  AcademicPeriodId,
  CampusId,
  InstitutionId,
  InstitutionalPolicyId,
  OrganisationalUnitId,
} from "@veza/contracts";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { isPostgresError } from "../../../platform/database/database.types.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type {
  ApproveInstitutionalPolicyDto,
  ConfigureTenantSetupProfileDto,
  CreateAcademicPeriodDto,
  CreateCampusDto,
  CreateInstitutionDto,
  CreateOrganisationalUnitDto,
} from "./institution-setup.dto.js";

interface IdRow extends QueryResultRow { readonly id: string; }
interface PeriodRow extends QueryResultRow {
  readonly starts_on: string;
  readonly ends_on: string;
  readonly parent_period_id: string | null;
  readonly status: "draft" | "published" | "closed" | "archived";
}
interface PolicyRow extends QueryResultRow {
  readonly id: string;
  readonly version: number;
  readonly effective_from: string;
}

function code(value: string): string {
  return value.trim().toUpperCase();
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function validateStructuredValue(value: unknown, label: string): void {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, "utf8") > 64 * 1024) {
    throw new BadRequestException(`${label} exceeds the maximum allowed size`);
  }
  const visit = (item: unknown, depth: number): void => {
    if (depth > 8) throw new BadRequestException(`${label} is nested too deeply`);
    if (Array.isArray(item)) {
      if (item.length > 250) throw new BadRequestException(`${label} contains too many list items`);
      item.forEach((child) => visit(child, depth + 1));
      return;
    }
    if (item && typeof item === "object") {
      const entries = Object.entries(item as Record<string, unknown>);
      if (entries.length > 100) throw new BadRequestException(`${label} contains too many properties`);
      entries.forEach(([, child]) => visit(child, depth + 1));
      return;
    }
    if (typeof item === "string" && item.length > 8_000) {
      throw new BadRequestException(`${label} contains an overlong text value`);
    }
  };
  visit(value, 0);
}

function address(value: Record<string, string> | undefined): Readonly<Record<string, string>> {
  const input = value ?? {};
  if (Object.keys(input).length > 20) throw new BadRequestException("Campus address contains too many fields");
  return Object.fromEntries(Object.entries(input).map(([key, item]) => {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,39}$/.test(key) || item.trim().length > 240) {
      throw new BadRequestException("Campus address contains an invalid field");
    }
    return [key, item.trim()];
  }));
}

function dateValue(value: string): number {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed)) throw new BadRequestException("Academic period contains an invalid date");
  return parsed;
}

@Injectable()
export class InstitutionStructureService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async configureProfile(input: ConfigureTenantSetupProfileDto) {
    const context = this.tenantContext.require();
    const result = {
      identityMode: input.identityMode,
      supportEmail: input.supportEmail.trim().toLowerCase(),
      privacyContactEmail: input.privacyContactEmail.trim().toLowerCase(),
      dataRetentionDays: input.dataRetentionDays,
      learnerSupportSlaHours: input.learnerSupportSlaHours,
    };
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `INSERT INTO tenant_setup_profiles (
           tenant_id, identity_mode, support_email, privacy_contact_email,
           data_retention_days, learner_support_sla_hours, configured_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id) DO UPDATE SET
           identity_mode = EXCLUDED.identity_mode,
           support_email = EXCLUDED.support_email,
           privacy_contact_email = EXCLUDED.privacy_contact_email,
           data_retention_days = EXCLUDED.data_retention_days,
           learner_support_sla_hours = EXCLUDED.learner_support_sla_hours,
           configured_by = EXCLUDED.configured_by,
           updated_at = now()`,
        [context.tenantId, result.identityMode, result.supportEmail, result.privacyContactEmail,
          result.dataRetentionDays, result.learnerSupportSlaHours, context.actorId],
      );
      await this.record(client, "tenant.setup-profile.configured", "tenant-setup-profile", context.tenantId, result);
      return result;
    });
  }

  async createInstitution(input: CreateInstitutionDto) {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      try {
        const inserted = await client.query<IdRow>(
          `INSERT INTO institutions (
             tenant_id, code, display_name, legal_name, institution_type,
             status, locale, timezone, contact_email, created_by
           ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9)
           RETURNING id`,
          [context.tenantId, code(input.code), input.displayName.trim(), input.legalName?.trim() || null,
            input.institutionType, input.locale, input.timezone,
            input.contactEmail?.trim().toLowerCase() || null, context.actorId],
        );
        const id = inserted.rows[0]?.id as InstitutionId | undefined;
        if (!id) throw new Error("Institution insert did not return an identifier");
        const result = { id, code: code(input.code), displayName: input.displayName.trim(), institutionType: input.institutionType, status: "active" as const };
        await this.record(client, "institution.created", "institution", id, result);
        return result;
      } catch (error) {
        if (isPostgresError(error, "23505")) throw new ConflictException("Institution code is already in use");
        throw error;
      }
    });
  }

  async createCampus(institutionId: InstitutionId, input: CreateCampusDto) {
    const context = this.tenantContext.require();
    const normalizedAddress = address(input.address);
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      if (input.isPrimary) {
        await client.query(
          `UPDATE campuses SET is_primary = false, updated_at = now()
           WHERE tenant_id = $1 AND institution_id = $2 AND is_primary = true AND status <> 'archived'`,
          [context.tenantId, institutionId],
        );
      }
      try {
        const inserted = await client.query<IdRow>(
          `INSERT INTO campuses (
             tenant_id, institution_id, code, display_name, delivery_mode,
             status, is_primary, timezone, address, created_by
           ) VALUES ($1,$2,$3,$4,$5,'active',$6,$7,$8,$9)
           RETURNING id`,
          [context.tenantId, institutionId, code(input.code), input.displayName.trim(), input.deliveryMode,
            input.isPrimary, input.timezone, normalizedAddress, context.actorId],
        );
        const id = inserted.rows[0]?.id as CampusId | undefined;
        if (!id) throw new Error("Campus insert did not return an identifier");
        const result = { id, institutionId, code: code(input.code), displayName: input.displayName.trim(), deliveryMode: input.deliveryMode, isPrimary: input.isPrimary, status: "active" as const };
        await this.record(client, "campus.created", "campus", id, result);
        return result;
      } catch (error) {
        if (isPostgresError(error, "23505")) {
          throw new ConflictException("Campus code or primary-campus selection conflicts with an existing campus");
        }
        throw error;
      }
    });
  }

  async createOrganisationalUnit(institutionId: InstitutionId, input: CreateOrganisationalUnitDto) {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      if (input.parentUnitId) {
        const parent = await client.query(
          `SELECT 1 FROM organisational_units
           WHERE tenant_id = $1 AND institution_id = $2 AND id = $3 AND status = 'active'`,
          [context.tenantId, institutionId, input.parentUnitId],
        );
        if (parent.rowCount === 0) {
          throw new BadRequestException("Parent organisational unit is not available in this institution");
        }
      }
      try {
        const inserted = await client.query<IdRow>(
          `INSERT INTO organisational_units (
             tenant_id, institution_id, parent_unit_id, code, display_name, unit_type, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id`,
          [context.tenantId, institutionId, input.parentUnitId ?? null, code(input.code),
            input.displayName.trim(), input.unitType, context.actorId],
        );
        const id = inserted.rows[0]?.id as OrganisationalUnitId | undefined;
        if (!id) throw new Error("Organisational unit insert did not return an identifier");
        const result = { id, institutionId, parentUnitId: input.parentUnitId ?? null, code: code(input.code), displayName: input.displayName.trim(), unitType: input.unitType, status: "active" as const };
        await this.record(client, "organisational-unit.created", "organisational-unit", id, result);
        return result;
      } catch (error) {
        if (isPostgresError(error, "23505")) throw new ConflictException("Organisational unit code is already in use");
        throw error;
      }
    });
  }

  async createAcademicPeriod(institutionId: InstitutionId, input: CreateAcademicPeriodDto) {
    const context = this.tenantContext.require();
    const starts = dateValue(input.startsOn);
    const ends = dateValue(input.endsOn);
    if (ends < starts) throw new BadRequestException("Academic period must end on or after its start date");
    if (input.teachingStartsOn && dateValue(input.teachingStartsOn) < starts) {
      throw new BadRequestException("Teaching cannot start before the academic period");
    }
    if (input.teachingEndsOn && dateValue(input.teachingEndsOn) > ends) {
      throw new BadRequestException("Teaching cannot end after the academic period");
    }
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      if (input.parentPeriodId) {
        const parent = await client.query<PeriodRow>(
          `SELECT starts_on::text, ends_on::text, parent_period_id, status
           FROM academic_periods
           WHERE tenant_id = $1 AND institution_id = $2 AND id = $3 AND status <> 'archived'`,
          [context.tenantId, institutionId, input.parentPeriodId],
        );
        const row = parent.rows[0];
        if (!row) throw new BadRequestException("Parent academic period is not available in this institution");
        if (input.startsOn < row.starts_on || input.endsOn > row.ends_on) {
          throw new BadRequestException("Child academic period must remain inside the parent period");
        }
      }
      try {
        const inserted = await client.query<IdRow>(
          `INSERT INTO academic_periods (
             tenant_id, institution_id, parent_period_id, code, display_name, period_type,
             starts_on, ends_on, teaching_starts_on, teaching_ends_on,
             enrolment_opens_at, enrolment_closes_at, results_release_at, timezone, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           RETURNING id`,
          [context.tenantId, institutionId, input.parentPeriodId ?? null, code(input.code),
            input.displayName.trim(), input.periodType, input.startsOn, input.endsOn,
            input.teachingStartsOn ?? null, input.teachingEndsOn ?? null,
            input.enrolmentOpensAt ?? null, input.enrolmentClosesAt ?? null,
            input.resultsReleaseAt ?? null, input.timezone, context.actorId],
        );
        const id = inserted.rows[0]?.id as AcademicPeriodId | undefined;
        if (!id) throw new Error("Academic period insert did not return an identifier");
        const result = { id, institutionId, parentPeriodId: input.parentPeriodId ?? null, code: code(input.code), displayName: input.displayName.trim(), periodType: input.periodType, startsOn: input.startsOn, endsOn: input.endsOn, status: "draft" as const };
        await this.record(client, "academic-period.created", "academic-period", id, result);
        return result;
      } catch (error) {
        if (isPostgresError(error, "23505")) throw new ConflictException("Academic period code is already in use");
        throw error;
      }
    });
  }

  async publishAcademicPeriod(institutionId: InstitutionId, periodId: AcademicPeriodId) {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const period = await client.query<PeriodRow & IdRow>(
        `SELECT id, starts_on::text, ends_on::text, parent_period_id, status
         FROM academic_periods
         WHERE tenant_id = $1 AND institution_id = $2 AND id = $3
         FOR UPDATE`,
        [context.tenantId, institutionId, periodId],
      );
      const row = period.rows[0];
      if (!row || row.status !== "draft") throw new ConflictException("Only a draft academic period can be published");
      if (row.parent_period_id) {
        const parent = await client.query(
          `SELECT 1 FROM academic_periods
           WHERE tenant_id = $1 AND institution_id = $2 AND id = $3 AND status = 'published'`,
          [context.tenantId, institutionId, row.parent_period_id],
        );
        if (parent.rowCount === 0) throw new ConflictException("Publish the parent academic period before publishing this child period");
      }
      await client.query(
        `UPDATE academic_periods
         SET status = 'published', published_by = $4, published_at = now(), updated_at = now()
         WHERE tenant_id = $1 AND institution_id = $2 AND id = $3`,
        [context.tenantId, institutionId, periodId, context.actorId],
      );
      const result = { id: periodId, institutionId, startsOn: row.starts_on, endsOn: row.ends_on, status: "published" as const };
      await this.record(client, "academic-period.published", "academic-period", periodId, result);
      return result;
    });
  }

  async approvePolicy(institutionId: InstitutionId, input: ApproveInstitutionalPolicyDto) {
    const context = this.tenantContext.require();
    validateStructuredValue(input.content, "Policy content");
    if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) {
      throw new BadRequestException("Policy effective period is invalid");
    }
    const checksum = createHash("sha256").update(stableJson(input.content), "utf8").digest("hex");
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
        [`${context.tenantId}:${institutionId}:${input.policyKey}`],
      );
      const current = await client.query<PolicyRow>(
        `SELECT id, version, effective_from::text
         FROM institutional_policies
         WHERE tenant_id = $1 AND institution_id = $2 AND policy_key = $3
           AND status = 'approved' AND effective_until IS NULL
         FOR UPDATE`,
        [context.tenantId, institutionId, input.policyKey],
      );
      const active = current.rows[0];
      if (active && input.effectiveFrom <= active.effective_from) {
        throw new BadRequestException("Replacement policy must take effect after the current approved version");
      }
      if (active) {
        await client.query(
          `UPDATE institutional_policies
           SET status = 'retired', effective_until = $4::date - 1, updated_at = now()
           WHERE tenant_id = $1 AND institution_id = $2 AND policy_key = $3 AND id = $5`,
          [context.tenantId, institutionId, input.policyKey, input.effectiveFrom, active.id],
        );
      }
      const version = (active?.version ?? 0) + 1;
      const id = randomUUID() as InstitutionalPolicyId;
      await client.query(
        `INSERT INTO institutional_policies (
           id, tenant_id, institution_id, policy_key, version, status, title,
           content, content_checksum, effective_from, effective_until,
           created_by, approved_by, approved_at
         ) VALUES ($1,$2,$3,$4,$5,'approved',$6,$7,$8,$9,$10,$11,$11,now())`,
        [id, context.tenantId, institutionId, input.policyKey, version, input.title.trim(),
          input.content, checksum, input.effectiveFrom, input.effectiveUntil ?? null, context.actorId],
      );
      const result = { id, institutionId, policyKey: input.policyKey, version, title: input.title.trim(), status: "approved" as const, effectiveFrom: input.effectiveFrom, effectiveUntil: input.effectiveUntil ?? null, checksum };
      await this.record(client, "institutional-policy.approved", "institutional-policy", id, result);
      return result;
    });
  }

  async overview() {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const [profile, institutions] = await Promise.all([
        client.query(
          `SELECT identity_mode, support_email, privacy_contact_email,
                  data_retention_days, learner_support_sla_hours, updated_at
           FROM tenant_setup_profiles WHERE tenant_id = $1`,
          [context.tenantId],
        ),
        client.query(
          `SELECT i.id, i.code, i.display_name, i.institution_type, i.status,
                  count(DISTINCT c.id) FILTER (WHERE c.status = 'active')::int AS active_campuses,
                  count(DISTINCT ou.id) FILTER (WHERE ou.status = 'active')::int AS active_units,
                  count(DISTINCT ap.id) FILTER (WHERE ap.status = 'published')::int AS published_periods,
                  COALESCE(array_agg(DISTINCT p.policy_key) FILTER (
                    WHERE p.status = 'approved' AND p.effective_from <= current_date
                      AND (p.effective_until IS NULL OR p.effective_until >= current_date)
                  ), '{}') AS approved_policies
           FROM institutions i
           LEFT JOIN campuses c ON c.tenant_id = i.tenant_id AND c.institution_id = i.id
           LEFT JOIN organisational_units ou ON ou.tenant_id = i.tenant_id AND ou.institution_id = i.id
           LEFT JOIN academic_periods ap ON ap.tenant_id = i.tenant_id AND ap.institution_id = i.id
           LEFT JOIN institutional_policies p ON p.tenant_id = i.tenant_id AND p.institution_id = i.id
           WHERE i.tenant_id = $1
           GROUP BY i.id, i.code, i.display_name, i.institution_type, i.status
           ORDER BY i.display_name`,
          [context.tenantId],
        ),
      ]);
      return { profile: profile.rows[0] ?? null, institutions: institutions.rows };
    });
  }

  private async requireInstitution(client: PoolClient, institutionId: InstitutionId): Promise<void> {
    const context = this.tenantContext.require();
    const result = await client.query(
      `SELECT 1 FROM institutions WHERE tenant_id = $1 AND id = $2 AND status <> 'archived'`,
      [context.tenantId, institutionId],
    );
    if (result.rowCount === 0) throw new NotFoundException("Institution was not found in this tenant");
  }

  private async record(
    client: PoolClient,
    eventType: string,
    resourceType: string,
    resourceId: string,
    afterState: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    const context = this.tenantContext.require();
    await this.audit.append(client, {
      tenantId: context.tenantId,
      plane: "application",
      eventType,
      actorId: context.actorId,
      membershipId: context.membershipId,
      resourceType,
      resourceId,
      purpose: "institution setup",
      correlationId: context.correlationId,
      afterState,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      eventName: eventType,
      eventVersion: 1,
      aggregateType: resourceType,
      aggregateId: resourceId,
      aggregateVersion: 1,
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: afterState,
    });
  }
}
