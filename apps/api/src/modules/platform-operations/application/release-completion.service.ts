import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import type {
  CreateReleaseVersionDto,
  CreateRollbackDecisionDto,
  RecordReleaseCompatibilityDto,
  SetReleaseRingTargetDto,
  SetTenantReleaseExceptionDto,
  TransitionReleaseRingTargetDto,
  TransitionReleaseVersionDto,
  UpdateTenantMigrationDto,
} from "./commercial-release-governance.dto.js";
import { PlatformAuditWriter } from "./platform-audit-writer.service.js";
import {
  canonicalHash,
  operationalReason,
  PlatformOperationExecutor,
  requireVersion,
} from "./release-governance-mutation-support.js";

type Row = QueryResultRow & Record<string, unknown>;

function camel(row: Row): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
    value instanceof Date ? value.toISOString() : value,
  ]));
}

function rows(result: { rows: Row[] }): readonly Record<string, unknown>[] {
  return result.rows.map(camel);
}

function correlation(value?: string): string {
  return value?.trim() || "missing-correlation-id";
}

@Injectable()
export class ReleaseCompletionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly executor: PlatformOperationExecutor,
    private readonly audit: PlatformAuditWriter,
  ) {}

  async overview() {
    const [versions, rings, targets, flags, ringFlags, assignments, exceptions, compatibility, migrations, rollbacks] = await Promise.all([
      this.database.controlPlaneQuery(
        `SELECT version_key, display_name, release_notes, lifecycle,
                compatibility_floor, schema_version, migration_bundle_key,
                migration_state, artifact_digest, source_commit_sha,
                created_by, approved_by, approved_at, activated_at,
                retired_at, version, created_at, updated_at
         FROM platform_release_versions
         ORDER BY created_at DESC, version_key DESC`,
      ),
      this.database.controlPlaneQuery(
        `SELECT ring.key, ring.display_name, ring.description, ring.sequence,
                ring.lifecycle, ring.target_version, ring.version,
                count(assignment.tenant_id)::integer tenant_count,
                count(assignment.tenant_id) FILTER (WHERE assignment.is_canary)::integer canary_count
         FROM release_rings ring
         LEFT JOIN tenant_release_assignments assignment
           ON assignment.ring_key = ring.key
          AND assignment.effective_from <= now()
          AND (assignment.effective_until IS NULL OR assignment.effective_until > now())
         GROUP BY ring.key,ring.display_name,ring.description,ring.sequence,
                  ring.lifecycle,ring.target_version,ring.version
         ORDER BY ring.sequence`,
      ),
      this.database.controlPlaneQuery(
        `SELECT target.id, target.ring_key, ring.display_name ring_name,
                target.release_version, target.rollout_percent,
                target.lifecycle, target.effective_from, target.effective_until,
                target.reason, target.created_by, target.approved_by,
                target.approved_at, target.version, target.created_at,
                count(compatibility.id) FILTER (WHERE compatibility.compatible)::integer compatible_tenants,
                count(compatibility.id) FILTER (WHERE NOT compatibility.compatible)::integer blocked_tenants
         FROM release_ring_targets target
         JOIN release_rings ring ON ring.key = target.ring_key
         LEFT JOIN tenant_release_assignments assignment
           ON assignment.ring_key = target.ring_key
         LEFT JOIN release_compatibility_reports compatibility
           ON compatibility.tenant_id = assignment.tenant_id
          AND compatibility.target_release_version = target.release_version
         GROUP BY target.id,ring.display_name,ring.sequence
         ORDER BY target.lifecycle IN ('planned','active','paused') DESC,
                  ring.sequence, target.effective_from DESC`,
      ),
      this.database.controlPlaneQuery(
        `SELECT key, display_name, description, risk_level, lifecycle,
                default_enabled, required_module_key, version, updated_at
         FROM feature_flags ORDER BY lifecycle = 'active' DESC, risk_level DESC, key`,
      ),
      this.database.controlPlaneQuery(
        `SELECT ring_key, feature_flag_key, enabled, reason, version, updated_at
         FROM release_ring_feature_flags ORDER BY ring_key, feature_flag_key`,
      ),
      this.database.controlPlaneQuery(
        `SELECT assignment.tenant_id, tenant.display_name tenant_name,
                assignment.ring_key, assignment.reason, assignment.is_canary,
                assignment.effective_from, assignment.effective_until,
                assignment.version, assignment.updated_at
         FROM tenant_release_assignments assignment
         JOIN tenants tenant ON tenant.id = assignment.tenant_id
         ORDER BY assignment.is_canary DESC, assignment.updated_at DESC LIMIT 500`,
      ),
      this.database.controlPlaneQuery(
        `SELECT exception.id, exception.tenant_id, tenant.display_name tenant_name,
                exception.pinned_release_version, exception.excluded_release_version,
                exception.reason, exception.effective_from, exception.effective_until,
                exception.state, exception.version, exception.created_at
         FROM tenant_release_exceptions exception
         JOIN tenants tenant ON tenant.id = exception.tenant_id
         ORDER BY exception.state = 'active' DESC, exception.created_at DESC LIMIT 250`,
      ),
      this.database.controlPlaneQuery(
        `SELECT report.id, report.tenant_id, tenant.display_name tenant_name,
                report.current_release_version, report.target_release_version,
                report.compatible, report.blockers, report.warnings,
                report.evidence, report.checked_by, report.correlation_id,
                report.checked_at
         FROM release_compatibility_reports report
         JOIN tenants tenant ON tenant.id = report.tenant_id
         ORDER BY report.checked_at DESC LIMIT 500`,
      ),
      this.database.controlPlaneQuery(
        `SELECT migration.tenant_id, tenant.display_name tenant_name,
                migration.target_release_version, migration.state,
                migration.current_step, migration.completed_steps,
                migration.last_error, migration.evidence,
                migration.started_at, migration.completed_at,
                migration.updated_by, migration.correlation_id,
                migration.version, migration.updated_at
         FROM tenant_release_migration_status migration
         JOIN tenants tenant ON tenant.id = migration.tenant_id
         ORDER BY migration.state IN ('failed','blocked') DESC,
                  migration.updated_at DESC LIMIT 500`,
      ),
      this.database.controlPlaneQuery(
        `SELECT rollback.id, rollback.ring_key, rollback.tenant_id,
                tenant.display_name tenant_name, rollback.from_release_version,
                rollback.to_release_version, rollback.reason, rollback.state,
                rollback.approved_by, rollback.effective_at,
                rollback.completed_at, rollback.evidence,
                rollback.correlation_id, rollback.created_at
         FROM release_rollback_decisions rollback
         LEFT JOIN tenants tenant ON tenant.id = rollback.tenant_id
         ORDER BY rollback.created_at DESC LIMIT 250`,
      ),
    ]);
    return {
      generatedAt: new Date().toISOString(),
      versions: rows(versions),
      rings: rows(rings),
      targets: rows(targets),
      featureFlags: rows(flags),
      ringFeatureFlags: rows(ringFlags),
      assignments: rows(assignments),
      exceptions: rows(exceptions),
      compatibility: rows(compatibility),
      migrations: rows(migrations),
      rollbacks: rows(rollbacks),
    };
  }

  async createVersion(
    principal: AuthenticatedPrincipal,
    input: CreateReleaseVersionDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    return this.executor.run(
      principal,
      idempotencyKey,
      "release.version.create",
      "release-version",
      input.versionKey,
      canonicalHash(input),
      async (client) => {
        const result = await client.query(
          `INSERT INTO platform_release_versions (
             version_key, display_name, release_notes, compatibility_floor,
             schema_version, migration_bundle_key, migration_state,
             artifact_digest, source_commit_sha, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
           RETURNING version_key, lifecycle, migration_state, version, created_at`,
          [input.versionKey, input.displayName.trim(), input.releaseNotes.trim(),
            input.compatibilityFloor ?? null, input.schemaVersion,
            input.migrationBundleKey, input.migrationState,
            input.artifactDigest, input.sourceCommitSha, principal.userId],
        ).catch((error: unknown) => {
          if ((error as { code?: string }).code === "23505") {
            throw new ConflictException("Release version already exists");
          }
          throw error;
        });
        await this.audit.append(client, {
          eventType: "release.version.created",
          actorId: principal.userId,
          resourceType: "release-version",
          resourceId: input.versionKey,
          correlationId: correlation(correlationId),
          metadata: { schemaVersion: input.schemaVersion, migrationState: input.migrationState, artifactDigest: input.artifactDigest },
        });
        return camel(result.rows[0]);
      },
    );
  }

  async transitionVersion(
    principal: AuthenticatedPrincipal,
    versionKey: string,
    input: TransitionReleaseVersionDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    return this.executor.run(
      principal,
      idempotencyKey,
      `release.version.${input.lifecycle}`,
      "release-version",
      versionKey,
      canonicalHash({ versionKey, ...input, reason }),
      async (client) => {
        const result = await client.query(
          `SELECT lifecycle, migration_state, created_by, approved_by, version
           FROM platform_release_versions WHERE version_key = $1 FOR UPDATE`,
          [versionKey],
        );
        const release = result.rows[0];
        if (!release) throw new NotFoundException("Release version was not found");
        requireVersion(input.expectedVersion, release.version, "Release version");
        if (input.lifecycle === "candidate") {
          if (release.lifecycle !== "draft") throw new ConflictException("Only draft releases can become candidates");
          if (release.created_by === principal.userId) throw new ConflictException("Release promotion requires a different operator");
          await client.query(
            `UPDATE platform_release_versions
             SET lifecycle = 'candidate', approved_by = $2, approved_at = now(),
                 version = version + 1, updated_at = now()
             WHERE version_key = $1`, [versionKey, principal.userId]);
        } else if (input.lifecycle === "active") {
          if (release.lifecycle !== "candidate") throw new ConflictException("Only release candidates can become active");
          if (!["completed", "not-required"].includes(release.migration_state)) {
            throw new ConflictException("Release migration bundle is not ready");
          }
          await client.query(
            `UPDATE platform_release_versions
             SET lifecycle = 'active', activated_at = now(),
                 version = version + 1, updated_at = now()
             WHERE version_key = $1`, [versionKey]);
        } else {
          if (!["candidate", "active"].includes(release.lifecycle)) {
            throw new ConflictException("Release cannot be retired or rolled back from its current state");
          }
          await client.query(
            `UPDATE platform_release_versions
             SET lifecycle = $2, retired_at = now(),
                 version = version + 1, updated_at = now()
             WHERE version_key = $1`, [versionKey, input.lifecycle]);
        }
        await this.audit.append(client, {
          eventType: `release.version.${input.lifecycle}`,
          actorId: principal.userId,
          resourceType: "release-version",
          resourceId: versionKey,
          correlationId: correlation(correlationId),
          metadata: { previousLifecycle: release.lifecycle, lifecycle: input.lifecycle, reason },
        });
        return { versionKey, lifecycle: input.lifecycle, version: release.version + 1 };
      },
    );
  }

  async createRingTarget(
    principal: AuthenticatedPrincipal,
    input: SetReleaseRingTargetDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    return this.executor.run(
      principal,
      idempotencyKey,
      "release.ring-target.create",
      "release-ring",
      input.ringKey,
      canonicalHash({ ...input, reason }),
      async (client) => {
        const release = await client.query(
          `SELECT lifecycle FROM platform_release_versions WHERE version_key = $1`,
          [input.releaseVersion],
        );
        if (!release.rows[0] || !["candidate", "active"].includes(release.rows[0].lifecycle)) {
          throw new BadRequestException("Ring target requires a candidate or active release");
        }
        const result = await client.query(
          `INSERT INTO release_ring_targets (
             ring_key, release_version, rollout_percent,
             effective_from, effective_until, reason, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, lifecycle, version, created_at`,
          [input.ringKey, input.releaseVersion, input.rolloutPercent,
            input.effectiveFrom, input.effectiveUntil ?? null, reason, principal.userId],
        ).catch((error: unknown) => {
          if ((error as { code?: string }).code === "23505") {
            throw new ConflictException("Release ring already has an open target");
          }
          throw error;
        });
        await this.audit.append(client, {
          eventType: "release.ring-target.created",
          actorId: principal.userId,
          resourceType: "release-ring-target",
          resourceId: result.rows[0].id,
          correlationId: correlation(correlationId),
          metadata: { ringKey: input.ringKey, releaseVersion: input.releaseVersion, rolloutPercent: input.rolloutPercent, reason },
        });
        return camel(result.rows[0]);
      },
    );
  }

  async transitionRingTarget(
    principal: AuthenticatedPrincipal,
    targetId: string,
    input: TransitionReleaseRingTargetDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    return this.executor.run(
      principal,
      idempotencyKey,
      `release.ring-target.${input.lifecycle}`,
      "release-ring-target",
      targetId,
      canonicalHash({ targetId, ...input, reason }),
      async (client) => {
        const result = await client.query(
          `SELECT ring_key, release_version, lifecycle, created_by,
                  approved_by, effective_from, version
           FROM release_ring_targets WHERE id = $1 FOR UPDATE`,
          [targetId],
        );
        const target = result.rows[0];
        if (!target) throw new NotFoundException("Release ring target was not found");
        requireVersion(input.expectedVersion, target.version, "Release ring target");
        if (input.lifecycle === "active") {
          if (!['planned','paused'].includes(target.lifecycle)) throw new ConflictException("Target cannot be activated from its current state");
          if (target.created_by === principal.userId && !target.approved_by) {
            throw new ConflictException("Ring target activation requires a different operator");
          }
          if (new Date(target.effective_from).getTime() > Date.now()) {
            throw new ConflictException("Future ring targets cannot be activated before their effective date");
          }
          await client.query(
            `UPDATE release_ring_targets
             SET lifecycle = 'active', approved_by = COALESCE(approved_by,$2),
                 approved_at = COALESCE(approved_at,now()),
                 version = version + 1, updated_at = now()
             WHERE id = $1`, [targetId, principal.userId]);
        } else {
          const allowed = input.lifecycle === "paused"
            ? ["active"]
            : input.lifecycle === "completed"
              ? ["active", "paused"]
              : ["active", "paused", "planned"];
          if (!allowed.includes(target.lifecycle)) throw new ConflictException("Target transition is not allowed");
          await client.query(
            `UPDATE release_ring_targets
             SET lifecycle = $2, version = version + 1, updated_at = now(),
                 effective_until = CASE WHEN $2 IN ('completed','rolled-back') THEN COALESCE(effective_until,now()) ELSE effective_until END
             WHERE id = $1`, [targetId, input.lifecycle]);
        }
        await this.audit.append(client, {
          eventType: `release.ring-target.${input.lifecycle}`,
          actorId: principal.userId,
          resourceType: "release-ring-target",
          resourceId: targetId,
          correlationId: correlation(correlationId),
          metadata: { ringKey: target.ring_key, releaseVersion: target.release_version, previousLifecycle: target.lifecycle, lifecycle: input.lifecycle, reason },
        });
        return { id: targetId, ringKey: target.ring_key, releaseVersion: target.release_version, lifecycle: input.lifecycle, version: target.version + 1 };
      },
    );
  }

  async setTenantException(
    principal: AuthenticatedPrincipal,
    input: SetTenantReleaseExceptionDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    if (!input.pinnedReleaseVersion && !input.excludedReleaseVersion) {
      throw new BadRequestException("Release exception requires a pinned or excluded version");
    }
    return this.executor.run(
      principal,
      idempotencyKey,
      "release.tenant-exception.set",
      "tenant",
      input.tenantId,
      canonicalHash({ ...input, reason }),
      async (client) => {
        await client.query(
          `UPDATE tenant_release_exceptions
           SET state = 'revoked', revoked_by = $2, revoked_at = now(),
               effective_until = COALESCE(effective_until,$3), version = version + 1
           WHERE tenant_id = $1 AND state = 'active'`,
          [input.tenantId, principal.userId, input.effectiveFrom],
        );
        const result = await client.query(
          `INSERT INTO tenant_release_exceptions (
             tenant_id, pinned_release_version, excluded_release_version,
             reason, effective_from, effective_until, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)
           RETURNING id, state, version, created_at`,
          [input.tenantId, input.pinnedReleaseVersion ?? null,
            input.excludedReleaseVersion ?? null, reason, input.effectiveFrom,
            input.effectiveUntil ?? null, principal.userId],
        );
        await this.audit.append(client, {
          eventType: "release.tenant-exception.set",
          actorId: principal.userId,
          resourceType: "tenant-release-exception",
          resourceId: result.rows[0].id,
          correlationId: correlation(correlationId),
          metadata: { tenantId: input.tenantId, pinnedReleaseVersion: input.pinnedReleaseVersion ?? null, excludedReleaseVersion: input.excludedReleaseVersion ?? null, reason },
        });
        return camel(result.rows[0]);
      },
    );
  }

  async recordCompatibility(
    principal: AuthenticatedPrincipal,
    input: RecordReleaseCompatibilityDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    return this.executor.run(
      principal,
      idempotencyKey,
      "release.compatibility.record",
      "tenant",
      input.tenantId,
      canonicalHash(input),
      async (client) => {
        const result = await client.query(
          `INSERT INTO release_compatibility_reports (
             tenant_id, current_release_version, target_release_version,
             compatible, blockers, warnings, evidence, checked_by, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, compatible, checked_at`,
          [input.tenantId, input.currentReleaseVersion ?? null,
            input.targetReleaseVersion, input.compatible, input.blockers,
            input.warnings, input.evidence ?? {}, input.checkedBy,
            correlation(correlationId)],
        );
        await this.audit.append(client, {
          eventType: "release.compatibility.recorded",
          actorId: principal.userId,
          resourceType: "release-compatibility",
          resourceId: result.rows[0].id,
          correlationId: correlation(correlationId),
          metadata: { tenantId: input.tenantId, targetReleaseVersion: input.targetReleaseVersion, compatible: input.compatible, blockers: input.blockers },
        });
        return camel(result.rows[0]);
      },
    );
  }

  async updateMigration(
    principal: AuthenticatedPrincipal,
    input: UpdateTenantMigrationDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    return this.executor.run(
      principal,
      idempotencyKey,
      "release.migration.update",
      "tenant",
      input.tenantId,
      canonicalHash(input),
      async (client) => {
        const current = await client.query(
          `SELECT version FROM tenant_release_migration_status
           WHERE tenant_id = $1 AND target_release_version = $2 FOR UPDATE`,
          [input.tenantId, input.targetReleaseVersion],
        );
        const version = Number(current.rows[0]?.version ?? 1);
        if (current.rowCount) requireVersion(input.expectedVersion, version, "Tenant migration status");
        else if (input.expectedVersion !== 1) throw new ConflictException("New migration status must start at version 1");
        const result = await client.query(
          `INSERT INTO tenant_release_migration_status (
             tenant_id, target_release_version, state, current_step,
             completed_steps, last_error, evidence, started_at,
             completed_at, updated_by, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,
             CASE WHEN $3 IN ('running','completed','failed','blocked','rolled-back') THEN now() ELSE NULL END,
             CASE WHEN $3 = 'completed' THEN now() ELSE NULL END,
             $8,$9)
           ON CONFLICT (tenant_id, target_release_version) DO UPDATE SET
             state = EXCLUDED.state,
             current_step = EXCLUDED.current_step,
             completed_steps = EXCLUDED.completed_steps,
             last_error = EXCLUDED.last_error,
             evidence = EXCLUDED.evidence,
             started_at = COALESCE(tenant_release_migration_status.started_at, EXCLUDED.started_at),
             completed_at = EXCLUDED.completed_at,
             updated_by = EXCLUDED.updated_by,
             correlation_id = EXCLUDED.correlation_id,
             version = tenant_release_migration_status.version + 1,
             updated_at = now()
           RETURNING state, version, updated_at`,
          [input.tenantId, input.targetReleaseVersion, input.state,
            input.currentStep ?? null, input.completedSteps,
            input.lastError ?? null, input.evidence ?? {},
            input.updatedBy, correlation(correlationId)],
        );
        await this.audit.append(client, {
          eventType: `release.migration.${input.state}`,
          actorId: principal.userId,
          resourceType: "tenant-release-migration",
          resourceId: `${input.tenantId}:${input.targetReleaseVersion}`,
          correlationId: correlation(correlationId),
          metadata: { tenantId: input.tenantId, targetReleaseVersion: input.targetReleaseVersion, state: input.state, currentStep: input.currentStep ?? null },
        });
        return camel(result.rows[0]);
      },
    );
  }

  async createRollback(
    principal: AuthenticatedPrincipal,
    input: CreateRollbackDecisionDto,
    idempotencyKey: string,
    correlationId?: string,
  ) {
    const reason = operationalReason(input.reason);
    if (!input.ringKey && !input.tenantId) {
      throw new BadRequestException("Rollback requires a release ring or tenant");
    }
    return this.executor.run(
      principal,
      idempotencyKey,
      "release.rollback.create",
      input.tenantId ? "tenant" : "release-ring",
      input.tenantId ?? input.ringKey ?? "unknown",
      canonicalHash({ ...input, reason }),
      async (client) => {
        const result = await client.query(
          `INSERT INTO release_rollback_decisions (
             ring_key, tenant_id, from_release_version, to_release_version,
             reason, approved_by, effective_at, correlation_id
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           RETURNING id, state, effective_at, created_at`,
          [input.ringKey ?? null, input.tenantId ?? null,
            input.fromReleaseVersion, input.toReleaseVersion,
            reason, principal.userId, input.effectiveAt,
            correlation(correlationId)],
        );
        if (input.tenantId) {
          await client.query(
            `UPDATE tenant_release_exceptions
             SET state = 'revoked', revoked_by = $2, revoked_at = now(),
                 effective_until = COALESCE(effective_until,$3), version = version + 1
             WHERE tenant_id = $1 AND state = 'active'`,
            [input.tenantId, principal.userId, input.effectiveAt],
          );
          await client.query(
            `INSERT INTO tenant_release_exceptions (
               tenant_id, pinned_release_version, reason,
               effective_from, created_by
             ) VALUES ($1,$2,$3,$4,$5)`,
            [input.tenantId, input.toReleaseVersion, reason,
              input.effectiveAt, principal.userId],
          );
        } else if (input.ringKey) {
          await client.query(
            `UPDATE release_ring_targets
             SET lifecycle = 'rolled-back', effective_until = COALESCE(effective_until,$2),
                 version = version + 1, updated_at = now()
             WHERE ring_key = $1 AND lifecycle IN ('planned','active','paused')`,
            [input.ringKey, input.effectiveAt],
          );
          await client.query(
            `INSERT INTO release_ring_targets (
               ring_key, release_version, rollout_percent, lifecycle,
               effective_from, reason, created_by, approved_by, approved_at
             ) VALUES ($1,$2,100,'active',$3,$4,$5,$5,now())`,
            [input.ringKey, input.toReleaseVersion, input.effectiveAt,
              reason, principal.userId],
          );
        }
        await this.audit.append(client, {
          eventType: "release.rollback.approved",
          actorId: principal.userId,
          resourceType: "release-rollback",
          resourceId: result.rows[0].id,
          correlationId: correlation(correlationId),
          metadata: { ringKey: input.ringKey ?? null, tenantId: input.tenantId ?? null, fromReleaseVersion: input.fromReleaseVersion, toReleaseVersion: input.toReleaseVersion, effectiveAt: input.effectiveAt, reason },
        });
        return camel(result.rows[0]);
      },
    );
  }
}
