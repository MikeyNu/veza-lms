import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";
import { S3CompatibleSigner } from "./s3-compatible-signer.js";
import type {
  ApproveMediaDeletionDto,
  CompleteMediaUploadDto,
  CreateMediaUploadDto,
  CreateRecordingConsentDto,
  CreateStorageNamespaceDto,
  CreateStoragePolicyDto,
  RecordMediaAccessibilityDto,
  RequestMediaDeletionDto,
  WithdrawRecordingConsentDto,
} from "./storage.dto.js";

function cleanFileName(value: string): string {
  const normalized = value.normalize("NFKC").replace(/[^A-Za-z0-9._-]+/g, "-");
  const trimmed = normalized.replace(/^-+|-+$/g, "").slice(0, 180);
  return trimmed || "upload.bin";
}

function mediaTypeMatches(mediaType: string, policyType: string): boolean {
  if (policyType.endsWith("/*")) return mediaType.startsWith(policyType.slice(0, -1));
  return mediaType === policyType;
}

async function appendAudit(
  client: PoolClient,
  tenantId: string,
  actorId: string,
  correlationId: string,
  eventType: string,
  resourceType: string,
  resourceId: string,
  evidence: Readonly<Record<string, unknown>>,
): Promise<void> {
  await client.query(
    `INSERT INTO audit_events (
       tenant_id, plane, event_type, actor_id, resource_type,
       resource_id, purpose, correlation_id, after_state
     ) VALUES ($1,'application',$2,$3,$4,$5,'media and storage administration',$6,$7)`,
    [tenantId, eventType, actorId, resourceType, resourceId, correlationId, evidence],
  );
}

@Injectable()
export class StorageService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly signer: S3CompatibleSigner,
  ) {}

  async workspace() {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const [namespaces, policies, assets, jobs, quota, usage, consents] = await Promise.all([
        client.query(
          `SELECT id, namespace_key, bucket_key, key_prefix, residency_region,
                  kms_key_reference, cdn_domain, status, version, updated_at
           FROM tenant_storage_namespaces ORDER BY namespace_key`,
        ),
        client.query(
          `SELECT id, policy_key, purpose, allowed_media_types, maximum_bytes,
                  require_checksum, require_malware_scan,
                  require_accessibility_evidence, retention_days,
                  legal_hold_capable, processing_profile, status, version
           FROM storage_policies ORDER BY policy_key`,
        ),
        client.query(
          `SELECT id, purpose, original_filename, media_type, byte_size,
                  checksum_sha256, status, malware_status, accessibility_status,
                  legal_hold, retained_until, version, created_at, updated_at
           FROM media_assets
           ORDER BY updated_at DESC LIMIT 100`,
        ),
        client.query(
          `SELECT job.id, job.asset_id, asset.original_filename,
                  job.job_type, job.state, job.attempts, job.maximum_attempts,
                  job.next_attempt_at, job.provider_reference, job.last_error,
                  job.created_at, job.completed_at
           FROM media_processing_jobs job
           JOIN media_assets asset ON asset.id = job.asset_id
           ORDER BY job.created_at DESC LIMIT 100`,
        ),
        client.query(
          `SELECT maximum_stored_bytes, maximum_monthly_egress_bytes,
                  maximum_monthly_transcode_seconds, enforcement,
                  warning_threshold, updated_at
           FROM storage_quota_policies WHERE tenant_id = $1`,
          [context.tenantId],
        ),
        client.query(
          `SELECT usage_type, sum(quantity) quantity, unit,
                  sum(cost_amount) cost_amount, currency
           FROM storage_usage_ledger
           WHERE occurred_at >= date_trunc('month', now())
           GROUP BY usage_type, unit, currency
           ORDER BY usage_type`,
        ),
        client.query(
          `SELECT id, institution_id, subject_person_id, recording_context,
                  purpose, state, granted_at, withdrawn_at, expires_at,
                  version, updated_at
           FROM recording_consents ORDER BY updated_at DESC LIMIT 50`,
        ),
      ]);
      const stored = await client.query(
        `SELECT COALESCE(sum(byte_size),0) stored_bytes
         FROM media_assets WHERE status NOT IN ('deleted','failed')`,
      );
      return {
        tenantId: context.tenantId,
        generatedAt: new Date().toISOString(),
        storedBytes: Number(stored.rows[0].stored_bytes),
        quota: quota.rows[0] ?? null,
        namespaces: namespaces.rows,
        policies: policies.rows,
        assets: assets.rows,
        processingJobs: jobs.rows,
        monthlyUsage: usage.rows,
        recordingConsents: consents.rows,
      };
    });
  }

  async createNamespace(input: CreateStorageNamespaceDto) {
    const context = this.context.require();
    const prefix = `tenants/${context.tenantId}/${input.namespaceKey}/`;
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{ id: string; version: number } & QueryResultRow>(
        `INSERT INTO tenant_storage_namespaces (
           tenant_id, namespace_key, bucket_key, key_prefix,
           residency_region, kms_key_reference, cdn_domain, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING id, version`,
        [
          context.tenantId,
          input.namespaceKey,
          input.bucketKey,
          prefix,
          input.residencyRegion,
          input.kmsKeyReference,
          input.cdnDomain ?? null,
          context.actorId,
        ],
      );
      return { id: result.rows[0].id, keyPrefix: prefix, version: result.rows[0].version };
    });
  }

  async createPolicy(input: CreateStoragePolicyDto) {
    const context = this.context.require();
    if (input.allowedMediaTypes.length === 0) {
      throw new BadRequestException("Storage policy requires at least one media type");
    }
    const result = await this.database.withTenantTransaction(context.tenantId, (client) =>
      client.query<{ id: string; version: number } & QueryResultRow>(
        `INSERT INTO storage_policies (
           tenant_id, policy_key, purpose, allowed_media_types, maximum_bytes,
           require_checksum, require_malware_scan,
           require_accessibility_evidence, retention_days,
           legal_hold_capable, processing_profile, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, version`,
        [
          context.tenantId,
          input.policyKey,
          input.purpose,
          input.allowedMediaTypes,
          input.maximumBytes,
          input.requireChecksum,
          input.requireMalwareScan,
          input.requireAccessibilityEvidence,
          input.retentionDays ?? null,
          input.legalHoldCapable,
          input.processingProfile,
          context.actorId,
        ],
      ),
    );
    return { id: result.rows[0].id, status: "active", version: result.rows[0].version };
  }

  async createUpload(input: CreateMediaUploadDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const namespaceResult = await client.query(
        `SELECT id, bucket_key, key_prefix, status
         FROM tenant_storage_namespaces WHERE id = $1`,
        [input.namespaceId],
      );
      const namespace = namespaceResult.rows[0];
      if (!namespace || namespace.status !== "active") {
        throw new NotFoundException("Active tenant storage namespace was not found");
      }
      const policyResult = await client.query(
        `SELECT id, purpose, allowed_media_types, maximum_bytes,
                require_checksum, retention_days, status
         FROM storage_policies WHERE id = $1`,
        [input.storagePolicyId],
      );
      const policy = policyResult.rows[0];
      if (!policy || policy.status !== "active") {
        throw new NotFoundException("Active storage policy was not found");
      }
      if (policy.purpose !== input.purpose) {
        throw new BadRequestException("Upload purpose does not match the selected storage policy");
      }
      if (input.byteSize > Number(policy.maximum_bytes)) {
        throw new BadRequestException("File exceeds the selected storage policy limit");
      }
      if (
        !(policy.allowed_media_types as string[]).some((allowed) =>
          mediaTypeMatches(input.mediaType, allowed),
        )
      ) {
        throw new BadRequestException("File media type is not allowed by the selected policy");
      }
      await client.query("SELECT app.assert_storage_quota($1,$2)", [context.tenantId, input.byteSize]);
      const assetId = randomUUID();
      const now = new Date();
      const datePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const objectKey = `${namespace.key_prefix}${input.purpose}/${datePath}/${assetId}/${cleanFileName(input.originalFilename)}`;
      const retainedUntil = policy.retention_days
        ? new Date(now.getTime() + Number(policy.retention_days) * 86_400_000)
        : null;
      await client.query(
        `INSERT INTO media_assets (
           id, tenant_id, institution_id, namespace_id, storage_policy_id,
           purpose, object_key, original_filename, media_type, byte_size,
           checksum_sha256, metadata, retained_until, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [assetId, context.tenantId, input.institutionId ?? null, input.namespaceId, input.storagePolicyId,
          input.purpose, objectKey, input.originalFilename.trim(), input.mediaType, input.byteSize,
          input.checksumSha256, input.metadata, retainedUntil, context.actorId],
      );
      const sessionId = randomUUID();
      const expiresAt = new Date(Date.now() + 15 * 60_000);
      await client.query(
        `INSERT INTO media_upload_sessions (
           id, tenant_id, asset_id, upload_method, expected_bytes,
           expected_checksum, expires_at, created_by
         ) VALUES ($1,$2,$3,'single-put',$4,$5,$6,$7)`,
        [sessionId, context.tenantId, assetId, input.byteSize, input.checksumSha256, expiresAt, context.actorId],
      );
      const upload = await this.signer.presign({
        bucket: namespace.bucket_key,
        key: objectKey,
        method: "PUT",
        expiresSeconds: 900,
        contentType: input.mediaType,
        checksumSha256: input.checksumSha256,
      });
      await appendAudit(client, context.tenantId, context.actorId, context.correlationId,
        "storage.media-upload.created", "media-asset", assetId, {
          purpose: input.purpose,
          mediaType: input.mediaType,
          byteSize: input.byteSize,
          checksumSha256: input.checksumSha256,
          namespaceId: input.namespaceId,
          storagePolicyId: input.storagePolicyId,
        });
      return {
        assetId,
        uploadSessionId: sessionId,
        objectKey,
        uploadUrl: upload.url,
        requiredHeaders: upload.requiredHeaders,
        expiresAt: upload.expiresAt,
        version: 1,
      };
    });
  }

  async completeUpload(sessionId: string, input: CompleteMediaUploadDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const current = await client.query(
        `SELECT session.asset_id, session.expected_bytes,
                session.expected_checksum, session.state, session.version,
                asset.status
         FROM media_upload_sessions session
         JOIN media_assets asset ON asset.id = session.asset_id
         WHERE session.id = $1 FOR UPDATE`,
        [sessionId],
      );
      const session = current.rows[0];
      if (!session) throw new NotFoundException("Media upload session was not found");
      if (session.state !== "created" && session.state !== "uploading") {
        throw new ConflictException("Media upload session is no longer completable");
      }
      if (session.version !== input.expectedVersion) {
        throw new ConflictException("Media upload session changed since it was loaded");
      }
      if (Number(session.expected_bytes) !== input.acknowledgedBytes || session.expected_checksum !== input.checksumSha256) {
        throw new BadRequestException("Upload completion evidence does not match the registered file");
      }
      await client.query(
        `UPDATE media_upload_sessions
         SET state = 'uploaded', acknowledged_bytes = $2,
             version = version + 1, updated_at = now()
         WHERE id = $1`,
        [sessionId, input.acknowledgedBytes],
      );
      await client.query(
        `UPDATE media_assets
         SET status = 'uploaded', version = version + 1, updated_at = now()
         WHERE id = $1`,
        [session.asset_id],
      );
      const jobs = await client.query<{ enqueued: number } & QueryResultRow>(
        "SELECT app.enqueue_media_processing($1) enqueued",
        [session.asset_id],
      );
      return { assetId: session.asset_id, status: "processing", processingJobs: Number(jobs.rows[0]?.enqueued ?? 0) };
    });
  }

  async recordAccessibility(assetId: string, input: RecordMediaAccessibilityDto) {
    const context = this.context.require();
    if (!input.altText && !input.transcript && !input.caption) {
      throw new BadRequestException("Accessibility evidence requires alternative text, caption or transcript");
    }
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const current = await client.query(
        `SELECT media_type, version, metadata FROM media_assets WHERE id = $1 FOR UPDATE`,
        [assetId],
      );
      const asset = current.rows[0];
      if (!asset) throw new NotFoundException("Media asset was not found");
      if (asset.version !== input.expectedVersion) {
        throw new ConflictException("Media asset changed since it was loaded");
      }
      const metadata = {
        ...asset.metadata,
        accessibility: {
          altText: input.altText,
          caption: input.caption,
          transcriptProvided: Boolean(input.transcript),
          recordedAt: new Date().toISOString(),
          recordedBy: context.actorId,
        },
      };
      const updated = await client.query(
        `UPDATE media_assets
         SET accessibility_status = 'complete', metadata = $2,
             version = version + 1, updated_at = now()
         WHERE id = $1 RETURNING version`,
        [assetId, metadata],
      );
      if (input.transcript) {
        await client.query(
          `INSERT INTO media_text_tracks (
             tenant_id, asset_id, track_type, language_tag,
             inline_text, format, checksum_sha256, generated_by,
             reviewed_by, reviewed_at, status
           ) VALUES ($1,$2,'transcript','en-ZA',$3,'txt',$4,'human',$5,now(),'published')
           ON CONFLICT DO NOTHING`,
          [context.tenantId, assetId, input.transcript, this.checksum(input.transcript), context.actorId],
        );
      }
      return { id: assetId, accessibilityStatus: "complete", version: updated.rows[0].version };
    });
  }

  async deliveryUrl(assetId: string, renditionKey?: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query(
        `SELECT asset.object_key, namespace.cdn_domain,
                asset.status, asset.byte_size,
                rendition.object_key rendition_object_key,
                rendition.byte_size rendition_byte_size
         FROM media_assets asset
         JOIN tenant_storage_namespaces namespace ON namespace.id = asset.namespace_id
         LEFT JOIN media_renditions rendition
           ON rendition.asset_id = asset.id
          AND rendition.rendition_key = $2
          AND rendition.status = 'ready'
         WHERE asset.id = $1`,
        [assetId, renditionKey ?? null],
      );
      const row = result.rows[0];
      if (!row || row.status !== "ready") throw new NotFoundException("Ready media asset was not found");
      if (!row.cdn_domain) throw new ConflictException("Tenant media CDN is not configured");
      const objectKey = row.rendition_object_key ?? row.object_key;
      const bytes = Number(row.rendition_byte_size ?? row.byte_size);
      const signed = this.signer.signedDeliveryUrl(row.cdn_domain, objectKey, context.tenantId);
      await client.query(
        `INSERT INTO storage_usage_ledger (
           tenant_id, asset_id, usage_type, quantity, unit,
           occurred_at, source_reference, metadata
         ) VALUES ($1,$2,'egress-byte',$3,'byte',now(),$4,$5)
         ON CONFLICT DO NOTHING`,
        [context.tenantId, assetId, bytes, `delivery:${assetId}:${renditionKey ?? "source"}:${signed.expiresAt}`,
          { renditionKey: renditionKey ?? null }],
      );
      return signed;
    });
  }

  async createConsent(input: CreateRecordingConsentDto) {
    const context = this.context.require();
    const result = await this.database.withTenantTransaction(context.tenantId, (client) =>
      client.query<{ id: string; version: number } & QueryResultRow>(
        `INSERT INTO recording_consents (
           tenant_id, institution_id, subject_person_id, recording_context,
           purpose, state, granted_at, expires_at, evidence, captured_by
         ) VALUES ($1,$2,$3,$4,$5,$6,
           CASE WHEN $6 = 'granted' THEN now() ELSE NULL END,$7,$8,$9)
         RETURNING id, version`,
        [context.tenantId, input.institutionId, input.subjectPersonId, input.recordingContext.trim(),
          input.purpose.trim(), input.state, input.expiresAt ?? null, input.evidence, context.actorId],
      ),
    );
    return { id: result.rows[0].id, state: input.state, version: result.rows[0].version };
  }

  async withdrawConsent(consentId: string, input: WithdrawRecordingConsentDto) {
    const context = this.context.require();
    const result = await this.database.withTenantTransaction(context.tenantId, (client) =>
      client.query(
        `UPDATE recording_consents
         SET state = 'withdrawn', withdrawn_at = now(),
             evidence = evidence || jsonb_build_object('withdrawalReason',$3,'withdrawnBy',$4),
             version = version + 1, updated_at = now()
         WHERE id = $1 AND version = $2 AND state = 'granted'
         RETURNING version`,
        [consentId, input.expectedVersion, input.reason.trim(), context.actorId],
      ),
    );
    if (!result.rowCount) throw new ConflictException("Recording consent is stale or not withdrawable");
    return { id: consentId, state: "withdrawn", version: result.rows[0].version };
  }

  async requestDeletion(assetId: string, input: RequestMediaDeletionDto) {
    const context = this.context.require();
    const executeAfter = input.executeAfter ? new Date(input.executeAfter) : new Date(Date.now() + 24 * 60 * 60_000);
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const asset = await client.query(`SELECT legal_hold, status FROM media_assets WHERE id = $1 FOR UPDATE`, [assetId]);
      if (!asset.rowCount) throw new NotFoundException("Media asset was not found");
      if (asset.rows[0].legal_hold) throw new ConflictException("Media asset is under legal hold");
      const result = await client.query<{ id: string } & QueryResultRow>(
        `INSERT INTO storage_deletion_requests (
           tenant_id, asset_id, reason, requested_by, execute_after
         ) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [context.tenantId, assetId, input.reason.trim(), context.actorId, executeAfter],
      );
      await client.query(
        `UPDATE media_assets SET status = 'deletion-pending', version = version + 1,
             updated_at = now() WHERE id = $1`,
        [assetId],
      );
      return { id: result.rows[0].id, status: "requested", executeAfter: executeAfter.toISOString() };
    });
  }

  async approveDeletion(requestId: string, input: ApproveMediaDeletionDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const current = await client.query(
        `SELECT asset_id, requested_by, status, execute_after
         FROM storage_deletion_requests WHERE id = $1 FOR UPDATE`,
        [requestId],
      );
      const request = current.rows[0];
      if (!request || request.status !== "requested") {
        throw new NotFoundException("Pending storage deletion request was not found");
      }
      if (request.requested_by === context.actorId) {
        throw new ConflictException("Storage deletion approval requires an independent approver");
      }
      await client.query(
        `UPDATE storage_deletion_requests
         SET status = 'approved', approved_by = $2, approved_at = now()
         WHERE id = $1`,
        [requestId, context.actorId],
      );
      await client.query(
        `INSERT INTO media_processing_jobs (
           tenant_id, asset_id, job_type, profile, next_attempt_at
         ) VALUES ($1,$2,'delete-object',$3,$4)
         ON CONFLICT (tenant_id, asset_id, job_type)
         DO UPDATE SET state = 'pending', next_attempt_at = EXCLUDED.next_attempt_at,
                       last_error = NULL`,
        [context.tenantId, request.asset_id, { deletionRequestId: requestId, reason: input.reason.trim() }, request.execute_after],
      );
      return { id: requestId, status: "approved" };
    });
  }

  private checksum(value: string): string {
    return require("node:crypto").createHash("sha256").update(value, "utf8").digest("hex");
  }
}
