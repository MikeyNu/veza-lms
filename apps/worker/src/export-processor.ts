import type { Pool, QueryResultRow } from "pg";
import { renderExport, type ExportDocument, type RenderedExport } from "./export-document.js";
import { sanitizeDeliveryError } from "./delivery-error.js";
import { nextAttemptAt, retryDelaySeconds } from "./retry.js";
import type { ScheduledJobHandler } from "./scheduler.js";

interface ExportJobRow extends QueryResultRow {
  readonly id: string;
  readonly tenant_id: string;
  readonly export_type: "transcript" | "gradebook" | "enrolments" | "people" | "analytics";
  readonly format: "csv" | "json" | "pdf";
  readonly attempts: number;
  readonly maximum_attempts: number;
}

interface StoredExport {
  readonly objectKey: string;
}

export interface ExportObjectStore {
  put(input: {
    readonly exportId: string;
    readonly tenantId: string;
    readonly objectKey: string;
    readonly mediaType: string;
    readonly checksumSha256: string;
    readonly bytes: Buffer;
  }): Promise<StoredExport>;
}

export class HttpExportObjectStore implements ExportObjectStore {
  constructor(
    private readonly endpoint: string | undefined,
    private readonly token: string | undefined,
    private readonly timeoutMs: number,
  ) {}

  async put(input: {
    readonly exportId: string;
    readonly tenantId: string;
    readonly objectKey: string;
    readonly mediaType: string;
    readonly checksumSha256: string;
    readonly bytes: Buffer;
  }): Promise<StoredExport> {
    if (!this.endpoint) throw new Error("export-object-store-unavailable");
    const response = await fetch(this.endpoint, {
      method: "PUT",
      headers: {
        "content-type": input.mediaType,
        "content-length": String(input.bytes.length),
        "x-veza-export-id": input.exportId,
        "x-veza-tenant-id": input.tenantId,
        "x-veza-object-key": input.objectKey,
        "x-veza-checksum-sha256": input.checksumSha256,
        ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
      },
      body: new Uint8Array(input.bytes),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    const body = (await response.json().catch(() => ({}))) as { objectKey?: string; message?: string };
    if (!response.ok) throw new Error(body.message ?? `export-object-store-http-${response.status}`);
    if (body.objectKey !== input.objectKey) throw new Error("export-object-store-key-mismatch");
    return { objectKey: body.objectKey };
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function documentPayload(value: unknown): ExportDocument {
  if (!isRecord(value)) throw new Error("export-payload-not-object");
  if (
    typeof value.exportId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.generatedAt !== "string" ||
    typeof value.tenantName !== "string" ||
    (value.institutionName !== null && value.institutionName !== undefined && typeof value.institutionName !== "string") ||
    !Array.isArray(value.columns) ||
    !value.columns.every((column) => typeof column === "string") ||
    !Array.isArray(value.rows) ||
    !value.rows.every(isRecord) ||
    !isRecord(value.filters)
  ) {
    throw new Error("export-payload-contract-invalid");
  }
  if (!Number.isFinite(Date.parse(value.generatedAt))) throw new Error("export-payload-generated-at-invalid");
  if (value.columns.length === 0 || value.columns.length > 100) throw new Error("export-payload-columns-invalid");
  if (value.rows.length > 10000) throw new Error("export-payload-row-limit-exceeded");
  return {
    exportId: value.exportId,
    title: value.title,
    generatedAt: value.generatedAt,
    tenantName: value.tenantName,
    ...(typeof value.institutionName === "string" ? { institutionName: value.institutionName } : {}),
    columns: value.columns,
    rows: value.rows,
    filters: value.filters,
  };
}

export class ExportProcessor {
  constructor(
    private readonly pool: Pool,
    private readonly objectStore: ExportObjectStore,
    private readonly workerId: string,
    private readonly batchSize: number,
    private readonly leaseSeconds: number,
    private readonly expirySeconds: number,
    private readonly retryBaseSeconds: number,
    private readonly retryMaximumSeconds: number,
  ) {}

  private async claim(): Promise<readonly ExportJobRow[]> {
    const result = await this.pool.query<ExportJobRow>(
      "SELECT * FROM app.claim_export_jobs($1,$2,$3)",
      [this.workerId, this.batchSize, this.leaseSeconds],
    );
    return result.rows;
  }

  private async payload(exportId: string): Promise<ExportDocument> {
    const result = await this.pool.query<{ payload: unknown } & QueryResultRow>(
      "SELECT app.export_document_payload($1) payload",
      [exportId],
    );
    return documentPayload(result.rows[0]?.payload);
  }

  private objectKey(job: ExportJobRow, rendered: RenderedExport): string {
    return `exports/${job.tenant_id}/${job.export_type}/${job.id}.${rendered.extension}`;
  }

  private async complete(
    job: ExportJobRow,
    rendered: RenderedExport,
    objectKey: string,
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + this.expirySeconds * 1000);
    const result = await this.pool.query<{ completed: boolean } & QueryResultRow>(
      "SELECT app.complete_export_job($1,$2,$3,$4,$5,$6,$7) completed",
      [
        job.id,
        this.workerId,
        job.attempts,
        objectKey,
        rendered.checksumSha256,
        rendered.rowCount,
        expiresAt,
      ],
    );
    if (result.rows[0]?.completed !== true) throw new Error("export-completion-lease-lost");
  }

  private async fail(job: ExportJobRow, error: unknown): Promise<void> {
    const delaySeconds = retryDelaySeconds(
      job.id,
      job.attempts,
      this.retryBaseSeconds,
      this.retryMaximumSeconds,
    );
    const result = await this.pool.query<{ failed: boolean } & QueryResultRow>(
      "SELECT app.fail_export_job($1,$2,$3,$4,$5) failed",
      [
        job.id,
        this.workerId,
        job.attempts,
        sanitizeDeliveryError(error).slice(0, 2000),
        nextAttemptAt(new Date(), delaySeconds),
      ],
    );
    if (result.rows[0]?.failed !== true) throw new Error("export-failure-lease-lost");
  }

  private async process(job: ExportJobRow): Promise<void> {
    const rendered = renderExport(await this.payload(job.id), job.format);
    const expectedObjectKey = this.objectKey(job, rendered);
    const stored = await this.objectStore.put({
      exportId: job.id,
      tenantId: job.tenant_id,
      objectKey: expectedObjectKey,
      mediaType: rendered.mediaType,
      checksumSha256: rendered.checksumSha256,
      bytes: rendered.bytes,
    });
    if (stored.objectKey !== expectedObjectKey) throw new Error("export-persisted-object-key-mismatch");
    await this.complete(job, rendered, stored.objectKey);
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
        await this.process(job);
        completed += 1;
      } catch (error) {
        await this.fail(job, error);
        failed += 1;
      }
    }
    return { claimed: jobs.length, completed, failed };
  }
}

export class ExportExpiryHandler implements ScheduledJobHandler {
  constructor(private readonly pool: Pool) {}

  async execute(): Promise<Readonly<Record<string, unknown>>> {
    const result = await this.pool.query<{ expired: number } & QueryResultRow>(
      "SELECT app.expire_export_jobs() expired",
    );
    return { expired: Number(result.rows[0]?.expired ?? 0) };
  }
}
