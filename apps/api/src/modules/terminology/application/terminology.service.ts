import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  CanonicalTerminologyKey,
  ProgrammeHierarchyLevel,
  ResolvedInstitutionTerminology,
  TerminologyEntry,
  TerminologyVersion,
} from "@veza/contracts";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type {
  ApproveTerminologyDto,
  CreateTerminologyVersionDto,
  SubmitTerminologyReviewDto,
} from "./terminology.dto.js";

interface VersionRow extends QueryResultRow {
  id: string;
  institution_id: string;
  locale: string;
  version_number: number;
  lifecycle: string;
  title: string;
  description: string | null;
  effective_from: string | null;
  effective_until: string | null;
  created_by: string;
  submitted_by: string | null;
  version: number;
}

const canonicalKeys: readonly CanonicalTerminologyKey[] = [
  "learner",
  "staff",
  "guardian",
  "sponsor",
  "programme",
  "qualification",
  "learning-path",
  "subject",
  "module",
  "course",
  "grade",
  "year",
  "level",
  "cohort",
  "class",
  "academic-period",
  "outcome",
  "competency",
];

const defaultLabels: Readonly<Record<CanonicalTerminologyKey, Readonly<{
  singular: string;
  plural: string;
  short?: string;
}>>> = Object.freeze({
  learner: { singular: "Learner", plural: "Learners" },
  staff: { singular: "Staff member", plural: "Staff" },
  guardian: { singular: "Guardian", plural: "Guardians" },
  sponsor: { singular: "Sponsor", plural: "Sponsors" },
  programme: { singular: "Programme", plural: "Programmes" },
  qualification: { singular: "Qualification", plural: "Qualifications" },
  "learning-path": { singular: "Learning path", plural: "Learning paths" },
  subject: { singular: "Subject", plural: "Subjects" },
  module: { singular: "Module", plural: "Modules" },
  course: { singular: "Course", plural: "Courses" },
  grade: { singular: "Grade", plural: "Grades" },
  year: { singular: "Year", plural: "Years" },
  level: { singular: "Level", plural: "Levels" },
  cohort: { singular: "Cohort", plural: "Cohorts" },
  class: { singular: "Class", plural: "Classes" },
  "academic-period": { singular: "Academic period", plural: "Academic periods" },
  outcome: { singular: "Outcome", plural: "Outcomes" },
  competency: { singular: "Competency", plural: "Competencies" },
});

function defaultHierarchy(institutionType: string): readonly ProgrammeHierarchyLevel[] {
  const levels =
    institutionType === "school"
      ? [
          ["year", "Year", "Years"],
          ["subject", "Subject", "Subjects"],
          ["course", "Course", "Courses"],
        ]
      : institutionType === "training-provider" || institutionType === "corporate-academy"
        ? [
            ["learning-path", "Learning path", "Learning paths"],
            ["module", "Module", "Modules"],
            ["course", "Course", "Courses"],
          ]
        : [
            ["qualification", "Qualification", "Qualifications"],
            ["programme", "Programme", "Programmes"],
            ["module", "Module", "Modules"],
            ["course", "Course", "Courses"],
          ];
  return levels.map(([canonicalType, singularLabel, pluralLabel], index) => ({
    levelOrder: index + 1,
    canonicalType: canonicalType as ProgrammeHierarchyLevel["canonicalType"],
    singularLabel,
    pluralLabel,
    isRequired: true,
    minimumOccurrences: 0,
  }));
}

@Injectable()
export class TerminologyService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async list(institutionId: string): Promise<readonly TerminologyVersion[]> {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const versions = await client.query<VersionRow>(
        `SELECT id,institution_id,locale,version_number,lifecycle,title,description,
                effective_from,effective_until,created_by,submitted_by,version
         FROM institution_terminology_versions
         WHERE institution_id=$1
         ORDER BY locale,version_number DESC`,
        [institutionId],
      );
      return Promise.all(versions.rows.map((row) => this.mapVersion(client, row)));
    });
  }

  async get(institutionId: string, versionId: string): Promise<TerminologyVersion> {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const result = await client.query<VersionRow>(
        `SELECT id,institution_id,locale,version_number,lifecycle,title,description,
                effective_from,effective_until,created_by,submitted_by,version
         FROM institution_terminology_versions
         WHERE id=$1 AND institution_id=$2`,
        [versionId, institutionId],
      );
      const version = result.rows[0];
      if (!version) throw new NotFoundException("Terminology version was not found");
      return this.mapVersion(client, version);
    });
  }

  async resolve(
    institutionId: string,
    requestedLocale: string,
    effectiveAt = new Date().toISOString(),
  ): Promise<ResolvedInstitutionTerminology> {
    const timestamp = Date.parse(effectiveAt);
    if (!Number.isFinite(timestamp)) throw new BadRequestException("Terminology effective time is invalid");
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const institution = await client.query<{
        locale: string;
        institution_type: string;
      } & QueryResultRow>(
        `SELECT locale,institution_type FROM institutions
         WHERE id=$1 AND status='active'`,
        [institutionId],
      );
      const currentInstitution = institution.rows[0];
      if (!currentInstitution) throw new NotFoundException("Active institution was not found");
      const localeCandidates = [...new Set([requestedLocale, currentInstitution.locale])];
      let selected: VersionRow | undefined;
      for (const locale of localeCandidates) {
        const result = await client.query<VersionRow>(
          `SELECT id,institution_id,locale,version_number,lifecycle,title,description,
                  effective_from,effective_until,created_by,submitted_by,version
           FROM institution_terminology_versions
           WHERE institution_id=$1 AND locale=$2 AND lifecycle='approved'
             AND effective_from <= $3::date
             AND (effective_until IS NULL OR effective_until > $3::date)
           ORDER BY effective_from DESC,version_number DESC
           LIMIT 1`,
          [institutionId, locale, new Date(timestamp).toISOString().slice(0, 10)],
        );
        if (result.rows[0]) {
          selected = result.rows[0];
          break;
        }
      }

      if (!selected) {
        return {
          institutionId,
          requestedLocale,
          resolvedLocale: currentInstitution.locale,
          effectiveAt: new Date(timestamp).toISOString(),
          labels: defaultLabels,
          programmeHierarchy: defaultHierarchy(currentInstitution.institution_type),
        };
      }

      const mapped = await this.mapVersion(client, selected);
      const labels = { ...defaultLabels } as Record<CanonicalTerminologyKey, {
        singular: string;
        plural: string;
        short?: string;
      }>;
      for (const entry of mapped.entries) {
        labels[entry.canonicalKey] = {
          singular: entry.singularLabel,
          plural: entry.pluralLabel,
          ...(entry.shortLabel ? { short: entry.shortLabel } : {}),
        };
      }
      return {
        institutionId,
        requestedLocale,
        resolvedLocale: selected.locale,
        terminologyVersionId: selected.id,
        effectiveAt: new Date(timestamp).toISOString(),
        labels,
        programmeHierarchy:
          mapped.programmeHierarchy.length > 0
            ? mapped.programmeHierarchy
            : defaultHierarchy(currentInstitution.institution_type),
      };
    });
  }

  async create(institutionId: string, input: CreateTerminologyVersionDto) {
    this.validateEntries(input.entries);
    this.validateHierarchy(input.programmeHierarchy ?? []);
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`terminology:${institutionId}:${input.locale}`],
      );
      const current = await client.query<{ next_version: number } & QueryResultRow>(
        `SELECT COALESCE(max(version_number),0)+1 next_version
         FROM institution_terminology_versions
         WHERE institution_id=$1 AND locale=$2`,
        [institutionId, input.locale],
      );
      const versionNumber = Number(current.rows[0]?.next_version ?? 1);
      await client.query(
        `INSERT INTO institution_terminology_versions (
           id,tenant_id,institution_id,locale,version_number,lifecycle,title,description,
           created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,'draft',$6,$7,$8,$8)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.locale,
          versionNumber,
          input.title.trim(),
          input.description?.trim() || null,
          context.actorId,
        ],
      );
      for (const entry of input.entries) {
        await client.query(
          `INSERT INTO institution_terminology_entries (
             tenant_id,terminology_version_id,canonical_key,singular_label,plural_label,
             short_label,help_text
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            context.tenantId,
            id,
            entry.canonicalKey,
            entry.singularLabel.trim(),
            entry.pluralLabel.trim(),
            entry.shortLabel?.trim() || null,
            entry.helpText?.trim() || null,
          ],
        );
      }
      for (const level of input.programmeHierarchy ?? []) {
        await client.query(
          `INSERT INTO programme_hierarchy_levels (
             tenant_id,terminology_version_id,level_order,canonical_type,singular_label,
             plural_label,is_required,minimum_occurrences,maximum_occurrences
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            context.tenantId,
            id,
            level.levelOrder,
            level.canonicalType,
            level.singularLabel.trim(),
            level.pluralLabel.trim(),
            level.isRequired,
            level.minimumOccurrences,
            level.maximumOccurrences ?? null,
          ],
        );
      }
      await this.record(client, "institution.terminology.created", id, {
        institutionId,
        locale: input.locale,
        versionNumber,
        entryCount: input.entries.length,
        hierarchyLevels: input.programmeHierarchy?.length ?? 0,
        version: 1,
      });
      return { id, institutionId, locale: input.locale, versionNumber, lifecycle: "draft", version: 1 };
    });
  }

  async submit(
    institutionId: string,
    versionId: string,
    input: SubmitTerminologyReviewDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE institution_terminology_versions
         SET lifecycle='in_review',submitted_by=$4,submitted_at=now(),updated_by=$4,
             updated_at=now(),version=version+1
         WHERE id=$1 AND institution_id=$2 AND lifecycle='draft' AND version=$3
         RETURNING version`,
        [versionId, institutionId, input.expectedVersion, context.actorId],
      );
      if (!updated.rows[0]) {
        throw new ConflictException("Terminology version changed or is no longer a draft");
      }
      await this.record(client, "institution.terminology.submitted", versionId, {
        institutionId,
        version: updated.rows[0].version,
      });
      return { id: versionId, lifecycle: "in_review", version: updated.rows[0].version };
    });
  }

  async approve(
    institutionId: string,
    versionId: string,
    input: ApproveTerminologyDto,
  ) {
    if (input.effectiveUntil && input.effectiveUntil <= input.effectiveFrom) {
      throw new BadRequestException("Effective-until must be later than effective-from");
    }
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`terminology-approval:${institutionId}`],
      );
      const result = await client.query<VersionRow>(
        `SELECT id,institution_id,locale,version_number,lifecycle,title,description,
                effective_from,effective_until,created_by,submitted_by,version
         FROM institution_terminology_versions
         WHERE id=$1 AND institution_id=$2
         FOR UPDATE`,
        [versionId, institutionId],
      );
      const current = result.rows[0];
      if (!current) throw new NotFoundException("Terminology version was not found");
      if (current.lifecycle !== "in_review" || current.version !== input.expectedVersion) {
        throw new ConflictException("Terminology version changed or is not awaiting approval");
      }
      if (current.created_by === context.actorId || current.submitted_by === context.actorId) {
        throw new ConflictException("Terminology approval requires an independent reviewer");
      }
      const entryCount = await client.query<{ count: string } & QueryResultRow>(
        `SELECT count(DISTINCT canonical_key)::text count
         FROM institution_terminology_entries WHERE terminology_version_id=$1`,
        [versionId],
      );
      if (Number(entryCount.rows[0]?.count ?? 0) !== canonicalKeys.length) {
        throw new ConflictException("Approved terminology packs must define every canonical label");
      }
      const previous = await client.query<{ id: string; effective_from: string } & QueryResultRow>(
        `SELECT id,effective_from
         FROM institution_terminology_versions
         WHERE institution_id=$1 AND locale=$2 AND lifecycle='approved'
           AND effective_until IS NULL AND id <> $3
         FOR UPDATE`,
        [institutionId, current.locale, versionId],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].effective_from >= input.effectiveFrom) {
          throw new ConflictException("Replacement terminology must take effect after the current version");
        }
        await client.query(
          `UPDATE institution_terminology_versions
           SET effective_until=$2,updated_by=$3,updated_at=now(),version=version+1
           WHERE id=$1`,
          [previous.rows[0].id, input.effectiveFrom, context.actorId],
        );
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE institution_terminology_versions
         SET lifecycle='approved',effective_from=$4,effective_until=$5,
             approved_by=$6,approved_at=now(),approval_notes=$7,
             updated_by=$6,updated_at=now(),version=version+1
         WHERE id=$1 AND institution_id=$2 AND version=$3
         RETURNING version`,
        [
          versionId,
          institutionId,
          input.expectedVersion,
          input.effectiveFrom,
          input.effectiveUntil ?? null,
          context.actorId,
          input.approvalNotes.trim(),
        ],
      );
      if (!updated.rows[0]) throw new ConflictException("Terminology version changed during approval");
      await this.record(client, "institution.terminology.approved", versionId, {
        institutionId,
        locale: current.locale,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
        version: updated.rows[0].version,
      });
      return { id: versionId, lifecycle: "approved", version: updated.rows[0].version };
    });
  }

  private validateEntries(entries: readonly TerminologyEntry[]): void {
    const keys = entries.map((entry) => entry.canonicalKey);
    if (new Set(keys).size !== keys.length) {
      throw new BadRequestException("Terminology entries must have unique canonical keys");
    }
  }

  private validateHierarchy(levels: readonly ProgrammeHierarchyLevel[]): void {
    const orders = levels.map((level) => level.levelOrder).sort((left, right) => left - right);
    const types = levels.map((level) => level.canonicalType);
    if (new Set(orders).size !== orders.length || new Set(types).size !== types.length) {
      throw new BadRequestException("Programme hierarchy levels and canonical types must be unique");
    }
    if (orders.some((order, index) => order !== index + 1)) {
      throw new BadRequestException("Programme hierarchy level order must be contiguous from one");
    }
    for (const level of levels) {
      if (
        level.maximumOccurrences !== undefined &&
        level.maximumOccurrences < level.minimumOccurrences
      ) {
        throw new BadRequestException(
          "Programme hierarchy maximum occurrences must not be lower than the minimum",
        );
      }
    }
  }

  private async mapVersion(client: PoolClient, row: VersionRow): Promise<TerminologyVersion> {
    const [entries, hierarchy] = await Promise.all([
      client.query(
        `SELECT canonical_key,singular_label,plural_label,short_label,help_text
         FROM institution_terminology_entries
         WHERE terminology_version_id=$1 ORDER BY canonical_key`,
        [row.id],
      ),
      client.query(
        `SELECT level_order,canonical_type,singular_label,plural_label,is_required,
                minimum_occurrences,maximum_occurrences
         FROM programme_hierarchy_levels
         WHERE terminology_version_id=$1 ORDER BY level_order`,
        [row.id],
      ),
    ]);
    return {
      id: row.id,
      institutionId: row.institution_id,
      locale: row.locale,
      versionNumber: row.version_number,
      lifecycle: row.lifecycle as TerminologyVersion["lifecycle"],
      title: row.title,
      description: row.description ?? undefined,
      effectiveFrom: row.effective_from ?? undefined,
      effectiveUntil: row.effective_until ?? undefined,
      version: row.version,
      entries: entries.rows.map((entry) => ({
        canonicalKey: entry.canonical_key,
        singularLabel: entry.singular_label,
        pluralLabel: entry.plural_label,
        shortLabel: entry.short_label ?? undefined,
        helpText: entry.help_text ?? undefined,
      })),
      programmeHierarchy: hierarchy.rows.map((level) => ({
        levelOrder: level.level_order,
        canonicalType: level.canonical_type,
        singularLabel: level.singular_label,
        pluralLabel: level.plural_label,
        isRequired: level.is_required,
        minimumOccurrences: level.minimum_occurrences,
        maximumOccurrences: level.maximum_occurrences ?? undefined,
      })),
    };
  }

  private async requireInstitution(client: PoolClient, institutionId: string): Promise<void> {
    const result = await client.query(
      "SELECT id FROM institutions WHERE id=$1 AND status='active'",
      [institutionId],
    );
    if (!result.rowCount) throw new NotFoundException("Active institution was not found");
  }

  private async record(
    client: PoolClient,
    eventType: string,
    resourceId: string,
    afterState: Record<string, unknown>,
  ): Promise<void> {
    const context = this.context.require();
    await this.audit.append(client, {
      tenantId: context.tenantId,
      plane: "application",
      eventType,
      actorId: context.actorId,
      membershipId: context.membershipId,
      resourceType: "institution-terminology",
      resourceId,
      correlationId: context.correlationId,
      afterState,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      aggregateType: "institution-terminology",
      aggregateId: resourceId,
      aggregateVersion: Number(afterState.version ?? 1),
      eventName: eventType,
      eventVersion: 1,
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: afterState,
    });
  }
}
