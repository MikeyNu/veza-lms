import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";
import type { UpdateStorageQuotaDto } from "./storage.dto.js";

interface QuotaRow extends QueryResultRow {
  readonly maximum_stored_bytes: string | number;
  readonly maximum_monthly_egress_bytes: string | number;
  readonly maximum_monthly_transcode_seconds: string | number;
  readonly enforcement: "observe" | "soft" | "hard";
  readonly warning_threshold: string | number;
  readonly updated_at: Date;
}

@Injectable()
export class StorageAdministrationService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async deletionRequests() {
    const context = this.context.require();
    const result = await this.database.withTenantTransaction(context.tenantId, (client) =>
      client.query(
        `SELECT request.id, request.asset_id, asset.original_filename,
                asset.media_type, asset.byte_size, asset.legal_hold,
                request.reason, request.requested_by, requester.display_name requested_by_name,
                request.requested_at, request.execute_after, request.status,
                request.approved_by, approver.display_name approved_by_name,
                request.approved_at, request.completed_at, request.failure_reason
         FROM storage_deletion_requests request
         JOIN media_assets asset ON asset.id = request.asset_id
         JOIN users requester ON requester.id = request.requested_by
         LEFT JOIN users approver ON approver.id = request.approved_by
         ORDER BY request.requested_at DESC, request.id DESC
         LIMIT 100`,
      ),
    );
    return {
      items: result.rows.map((row) => Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
          value instanceof Date ? value.toISOString() : value,
        ]),
      )),
    };
  }

  async updateQuota(input: UpdateStorageQuotaDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<QuotaRow>(
        `INSERT INTO storage_quota_policies (
           tenant_id, maximum_stored_bytes, maximum_monthly_egress_bytes,
           maximum_monthly_transcode_seconds, enforcement,
           warning_threshold, updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id)
         DO UPDATE SET maximum_stored_bytes = EXCLUDED.maximum_stored_bytes,
                       maximum_monthly_egress_bytes = EXCLUDED.maximum_monthly_egress_bytes,
                       maximum_monthly_transcode_seconds = EXCLUDED.maximum_monthly_transcode_seconds,
                       enforcement = EXCLUDED.enforcement,
                       warning_threshold = EXCLUDED.warning_threshold,
                       updated_by = EXCLUDED.updated_by,
                       updated_at = now()
         RETURNING maximum_stored_bytes, maximum_monthly_egress_bytes,
                   maximum_monthly_transcode_seconds, enforcement,
                   warning_threshold, updated_at`,
        [
          context.tenantId,
          input.maximumStoredBytes,
          input.maximumMonthlyEgressBytes,
          input.maximumMonthlyTranscodeSeconds,
          input.enforcement,
          input.warningThreshold,
          context.actorId,
        ],
      );
      const row = result.rows[0];
      await client.query(
        `INSERT INTO audit_events (
           tenant_id, plane, event_type, actor_id, resource_type,
           resource_id, purpose, correlation_id, after_state
         ) VALUES ($1,'application','storage.quota.updated',$2,'storage-quota',$1,
                   'media and storage administration',$3,$4)`,
        [
          context.tenantId,
          context.actorId,
          context.correlationId,
          {
            maximumStoredBytes: Number(row.maximum_stored_bytes),
            maximumMonthlyEgressBytes: Number(row.maximum_monthly_egress_bytes),
            maximumMonthlyTranscodeSeconds: Number(row.maximum_monthly_transcode_seconds),
            enforcement: row.enforcement,
            warningThreshold: Number(row.warning_threshold),
          },
        ],
      );
      return {
        maximumStoredBytes: Number(row.maximum_stored_bytes),
        maximumMonthlyEgressBytes: Number(row.maximum_monthly_egress_bytes),
        maximumMonthlyTranscodeSeconds: Number(row.maximum_monthly_transcode_seconds),
        enforcement: row.enforcement,
        warningThreshold: Number(row.warning_threshold),
        updatedAt: row.updated_at.toISOString(),
      };
    });
  }
}
