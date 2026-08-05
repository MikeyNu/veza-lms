import { createHash } from "node:crypto";
import type { Pool, PoolClient, QueryResultRow } from "pg";
import { sanitizeDeliveryError } from "./delivery-error.js";
import { nextAttemptAt, retryDelaySeconds } from "./retry.js";

interface MediaJob extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly asset_id: string;
  readonly job_type: string;
  readonly profile: Readonly<Record<string, unknown>>;
  readonly attempts: number;
  readonly maximum_attempts: number;
  readonly bucket_key: string;
  readonly object_key: string;
  readonly media_type: string;
  readonly byte_size: string | number;
  readonly checksum_sha256: string;
  readonly original_filename: string;
}

interface ProcessingResult {
  readonly providerReference?: string;
  readonly byteSize?: number;
  readonly checksumSha256?: string;
  readonly mediaType?: string;
  readonly malwareStatus?: "clean" | "infected" | "failed";
  readonly renditions?: readonly {
    readonly renditionKey: string;
    readonly objectKey: string;
    readonly mediaType: string;
    readonly byteSize: number;
    readonly checksumSha256: string;
    readonly width?: number;
    readonly height?: number;
    readonly durationSeconds?: number;
    readonly bitrate?: number;
    readonly metadata?: Readonly<Record<string, unknown>>;
  }[];
  readonly textTracks?: readonly {
    readonly trackType: "caption" | "subtitle" | "transcript" | "audio-description";
    readonly languageTag: string;
    readonly objectKey?: string;
    readonly inlineText?: string;
    readonly format: "vtt" | "srt" | "txt" | "json";
    readonly checksumSha256: string;
    readonly generatedBy: "provider" | "import";
  }[];
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly deleted?: boolean;
}

async function transaction<TResult>(
  pool: Pool,
  work: (client: PoolClient) => Promise<TResult>,
): Promise<TResult> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

function endpoint(jobType: string): string | undefined {
  if (jobType === "verify-object") return process.env.OBJECT_STORAGE_INSPECTION_URL;
  if (jobType === "delete-object") return process.env.OBJECT_STORAGE_DELETE_URL;
  if (jobType === "malware-scan") return process.env.MALWARE_SCANNER_URL;
  if (jobType === "image-renditions") return process.env.IMAGE_PROCESSOR_URL;
  if (jobType === "video-transcode" || jobType === "audio-transcode") {
    return process.env.MEDIA_TRANSCODER_URL;
  }
  if (jobType === "caption" || jobType === "transcript") {
    return process.env.SPEECH_PROCESSOR_URL;
  }
  return process.env.MEDIA_METADATA_PROCESSOR_URL;
}

function resultChecksum(result: ProcessingResult): string {
  return createHash("sha256").update(JSON.stringify(result), "utf8").digest("hex");
}

export class MediaProcessor {
  constructor(
    private readonly pool: Pool,
    private readonly workerId: string,
    private readonly batchSize: number,
    private readonly retryBaseSeconds: number,
    private readonly retryMaximumSeconds: number,
  ) {}

  private async claim(): Promise<readonly MediaJob[]> {
    return transaction(this.pool, async (client) => {
      const result = await client.query<MediaJob>(
        `WITH candidates AS (
           SELECT job.id
           FROM media_processing_jobs job
           WHERE job.state IN ('pending','retry')
             AND job.next_attempt_at <= now()
             AND (job.leased_at IS NULL OR job.leased_at < now() - interval '5 minutes')
           ORDER BY job.next_attempt_at, job.created_at, job.id
           FOR UPDATE SKIP LOCKED
           LIMIT $2
         )
         UPDATE media_processing_jobs job
         SET state = 'processing', attempts = attempts + 1,
             leased_at = now(), lease_owner = $1
         FROM candidates,
              media_assets asset,
              tenant_storage_namespaces namespace
         WHERE job.id = candidates.id
           AND asset.id = job.asset_id
           AND namespace.id = asset.namespace_id
         RETURNING job.id, job.tenant_id, job.asset_id, job.job_type,
                   job.profile, job.attempts, job.maximum_attempts,
                   namespace.bucket_key, asset.object_key, asset.media_type,
                   asset.byte_size, asset.checksum_sha256, asset.original_filename`,
        [this.workerId, this.batchSize],
      );
      return result.rows;
    });
  }

  private async process(job: MediaJob): Promise<ProcessingResult> {
    const providerEndpoint = endpoint(job.job_type)?.trim();
    if (!providerEndpoint) {
      if (process.env.MEDIA_PROCESSOR_ALLOW_LOCAL_STUB === "true" && process.env.NODE_ENV !== "production") {
        if (job.job_type === "verify-object") {
          return {
            providerReference: `local-${job.id}`,
            byteSize: Number(job.byte_size),
            checksumSha256: job.checksum_sha256,
            mediaType: job.media_type,
          };
        }
        if (job.job_type === "malware-scan") {
          return { providerReference: `local-${job.id}`, malwareStatus: "clean" };
        }
        if (job.job_type === "delete-object") {
          return { providerReference: `local-${job.id}`, deleted: true };
        }
        return { providerReference: `local-${job.id}`, metadata: { localStub: true } };
      }
      throw new Error(`media-provider-unavailable:${job.job_type}`);
    }
    const response = await fetch(providerEndpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        ...(process.env.MEDIA_PROCESSOR_TOKEN
          ? { authorization: `Bearer ${process.env.MEDIA_PROCESSOR_TOKEN}` }
          : {}),
        "x-veza-job-id": job.id,
        "x-veza-tenant-id": job.tenant_id,
      },
      body: JSON.stringify({
        jobId: job.id,
        tenantId: job.tenant_id,
        assetId: job.asset_id,
        jobType: job.job_type,
        bucket: job.bucket_key,
        objectKey: job.object_key,
        mediaType: job.media_type,
        byteSize: Number(job.byte_size),
        checksumSha256: job.checksum_sha256,
        originalFilename: job.original_filename,
        profile: job.profile,
      }),
      signal: AbortSignal.timeout(Number(process.env.MEDIA_PROCESSOR_TIMEOUT_MS ?? 120_000)),
    });
    const body = (await response.json().catch(() => ({}))) as ProcessingResult & {
      readonly message?: string;
    };
    if (!response.ok) throw new Error(body.message ?? `media-provider-http-${response.status}`);
    return body;
  }

  private async complete(job: MediaJob, result: ProcessingResult): Promise<void> {
    await transaction(this.pool, async (client) => {
      if (job.job_type === "verify-object") {
        if (
          result.byteSize !== Number(job.byte_size) ||
          result.checksumSha256 !== job.checksum_sha256 ||
          result.mediaType !== job.media_type
        ) {
          throw new Error("object-verification-evidence-mismatch");
        }
        await client.query(
          `UPDATE media_upload_sessions
           SET state = 'verified', version = version + 1, updated_at = now()
           WHERE asset_id = $1`,
          [job.asset_id],
        );
        await client.query(
          `INSERT INTO storage_usage_ledger (
             tenant_id, asset_id, usage_type, quantity, unit,
             occurred_at, source_reference, metadata
           ) VALUES ($1,$2,'ingress-byte',$3,'byte',now(),$4,$5)
           ON CONFLICT DO NOTHING`,
          [
            job.tenant_id,
            job.asset_id,
            Number(job.byte_size),
            `upload:${job.asset_id}`,
            { checksumSha256: job.checksum_sha256 },
          ],
        );
      }
      if (job.job_type === "malware-scan") {
        await client.query(
          `UPDATE media_assets
           SET malware_status = $2,
               status = CASE WHEN $2 = 'infected' THEN 'quarantined' ELSE status END,
               metadata = metadata || jsonb_build_object(
                 'malwareEvidence',$3::jsonb,
                 'malwareScannedAt',now()
               ),
               version = version + 1,
               updated_at = now()
           WHERE id = $1`,
          [job.asset_id, result.malwareStatus ?? "failed", result.metadata ?? {}],
        );
        await client.query(
          `INSERT INTO storage_usage_ledger (
             tenant_id, asset_id, usage_type, quantity, unit,
             occurred_at, source_reference, metadata
           ) VALUES ($1,$2,'scan-object',1,'object',now(),$3,$4)
           ON CONFLICT DO NOTHING`,
          [job.tenant_id, job.asset_id, `scan:${job.id}`, result.metadata ?? {}],
        );
      }
      for (const rendition of result.renditions ?? []) {
        await client.query(
          `INSERT INTO media_renditions (
             tenant_id, asset_id, rendition_key, object_key, media_type,
             byte_size, checksum_sha256, width, height, duration_seconds,
             bitrate, metadata
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT (tenant_id, asset_id, rendition_key)
           DO UPDATE SET object_key = EXCLUDED.object_key,
                         media_type = EXCLUDED.media_type,
                         byte_size = EXCLUDED.byte_size,
                         checksum_sha256 = EXCLUDED.checksum_sha256,
                         width = EXCLUDED.width,
                         height = EXCLUDED.height,
                         duration_seconds = EXCLUDED.duration_seconds,
                         bitrate = EXCLUDED.bitrate,
                         metadata = EXCLUDED.metadata,
                         status = 'ready'`,
          [
            job.tenant_id,
            job.asset_id,
            rendition.renditionKey,
            rendition.objectKey,
            rendition.mediaType,
            rendition.byteSize,
            rendition.checksumSha256,
            rendition.width ?? null,
            rendition.height ?? null,
            rendition.durationSeconds ?? null,
            rendition.bitrate ?? null,
            rendition.metadata ?? {},
          ],
        );
      }
      for (const track of result.textTracks ?? []) {
        await client.query(
          `INSERT INTO media_text_tracks (
             tenant_id, asset_id, track_type, language_tag, object_key,
             inline_text, format, checksum_sha256, generated_by, status
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft')
           ON CONFLICT DO NOTHING`,
          [
            job.tenant_id,
            job.asset_id,
            track.trackType,
            track.languageTag,
            track.objectKey ?? null,
            track.inlineText ?? null,
            track.format,
            track.checksumSha256,
            track.generatedBy,
          ],
        );
      }
      if (job.job_type === "delete-object" && result.deleted) {
        await client.query(
          `UPDATE media_assets
           SET status = 'deleted', deleted_at = now(), version = version + 1, updated_at = now()
           WHERE id = $1 AND NOT legal_hold`,
          [job.asset_id],
        );
        await client.query(
          `UPDATE storage_deletion_requests
           SET status = 'completed', completed_at = now()
           WHERE asset_id = $1 AND status IN ('approved','processing')`,
          [job.asset_id],
        );
      }
      await client.query(
        `UPDATE media_processing_jobs
         SET state = 'completed', completed_at = now(),
             provider_reference = $4, result = $5,
             last_error = NULL, leased_at = NULL, lease_owner = NULL
         WHERE id = $1 AND lease_owner = $2 AND attempts = $3 AND state = 'processing'`,
        [job.id, this.workerId, job.attempts, result.providerReference ?? null, {
          ...result,
          resultChecksum: resultChecksum(result),
        }],
      );
      if (job.job_type !== "delete-object") {
        await client.query("SELECT app.reconcile_media_asset($1)", [job.asset_id]);
      }
    });
  }

  private async fail(job: MediaJob, error: unknown): Promise<void> {
    const message = sanitizeDeliveryError(error);
    const deadLetter = job.attempts >= job.maximum_attempts;
    const delaySeconds = retryDelaySeconds(
      job.id,
      job.attempts,
      this.retryBaseSeconds,
      this.retryMaximumSeconds,
    );
    await transaction(this.pool, async (client) => {
      await client.query(
        `UPDATE media_processing_jobs
         SET state = $4, next_attempt_at = $5, last_error = $6,
             leased_at = NULL, lease_owner = NULL,
             completed_at = CASE WHEN $4 IN ('failed','dead-letter') THEN now() ELSE NULL END
         WHERE id = $1 AND lease_owner = $2 AND attempts = $3 AND state = 'processing'`,
        [
          job.id,
          this.workerId,
          job.attempts,
          deadLetter ? "dead-letter" : "retry",
          nextAttemptAt(new Date(), delaySeconds),
          message.slice(0, 2_000),
        ],
      );
      if (deadLetter) await client.query("SELECT app.reconcile_media_asset($1)", [job.asset_id]);
    });
  }

  async processDue(): Promise<{
    readonly claimed: number;
    readonly completed: number;
    readonly failed: number;
  }> {
    const jobs = await this.claim();
    let completed = 0;
    let failed = 0;
    for (const job of jobs) {
      try {
        await this.complete(job, await this.process(job));
        completed += 1;
      } catch (error) {
        await this.fail(job, error);
        failed += 1;
      }
    }
    return { claimed: jobs.length, completed, failed };
  }
}
