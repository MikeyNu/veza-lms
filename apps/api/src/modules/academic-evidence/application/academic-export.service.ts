import { createHash } from "node:crypto";
import {
  BadGatewayException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

interface ExportJobRow extends QueryResultRow {
  readonly id: string;
  readonly export_type: "transcript" | "gradebook" | "enrolments" | "people" | "analytics";
  readonly format: "csv" | "json" | "pdf";
  readonly status: "requested" | "processing" | "ready" | "failed" | "expired";
  readonly checksum: string | null;
  readonly row_count: string | null;
  readonly requested_at: string | Date;
  readonly ready_at: string | Date | null;
  readonly expires_at: string | Date | null;
  readonly failure_reason: string | null;
  readonly attempts: number;
  readonly object_key: string | null;
}

export interface ExportStatus {
  readonly id: string;
  readonly exportType: ExportJobRow["export_type"];
  readonly format: ExportJobRow["format"];
  readonly status: ExportJobRow["status"];
  readonly rowCount: number | null;
  readonly checksum: string | null;
  readonly requestedAt: string;
  readonly readyAt: string | null;
  readonly expiresAt: string | null;
  readonly failureReason: string | null;
  readonly attempts: number;
  readonly downloadPath: string | null;
}

export interface ExportDownload {
  readonly bytes: Buffer;
  readonly mediaType: "application/pdf" | "text/csv" | "application/json";
  readonly fileName: string;
  readonly checksum: string;
}

function boundedInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new ServiceUnavailableException(`${name} is invalid`);
  }
  return value;
}

function boundedMaximumBytes(): number {
  return boundedInteger("EXPORT_DOWNLOAD_MAXIMUM_BYTES", 52_428_800, 1_048_576, 262_144_000);
}

function objectStoreTimeoutMs(): number {
  return boundedInteger("EXPORT_OBJECT_STORE_TIMEOUT_MS", 60_000, 1_000, 300_000);
}

function objectStoreUrl(): string {
  const value = process.env.EXPORT_OBJECT_STORE_URL?.trim();
  if (!value) throw new ServiceUnavailableException("Export object storage is not configured");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceUnavailableException("Export object storage URL is invalid");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ServiceUnavailableException("Export object storage URL is invalid");
  }
  if (process.env.NODE_ENV === "production" && url.protocol !== "https:") {
    throw new ServiceUnavailableException("Export object storage must use HTTPS");
  }
  return url.toString();
}

function iso(value: string | Date | null): string | null {
  if (value === null) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new BadGatewayException("Export evidence contains an invalid timestamp");
  return date.toISOString();
}

function mediaType(format: ExportJobRow["format"]): ExportDownload["mediaType"] {
  return format === "pdf" ? "application/pdf" : format === "csv" ? "text/csv" : "application/json";
}

function safeFileName(job: ExportJobRow): string {
  return `veza-${job.export_type}-${job.id}.${job.format}`;
}

@Injectable()
export class AcademicExportService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  private async row(exportId: string): Promise<ExportJobRow> {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<ExportJobRow>(
        `SELECT id,export_type,format,status,checksum,row_count::text,requested_at,
                ready_at,expires_at,failure_reason,attempts,object_key
         FROM export_jobs WHERE id=$1`,
        [exportId],
      );
      const job = result.rows[0];
      if (!job) throw new NotFoundException("Export job was not found");
      return job;
    });
  }

  async status(exportId: string): Promise<ExportStatus> {
    const job = await this.row(exportId);
    const expiresAt = iso(job.expires_at);
    const expired = expiresAt !== null && new Date(expiresAt).getTime() <= Date.now();
    const status = expired && job.status === "ready" ? "expired" : job.status;
    return {
      id: job.id,
      exportType: job.export_type,
      format: job.format,
      status,
      rowCount: job.row_count === null ? null : Number(job.row_count),
      checksum: job.checksum,
      requestedAt: iso(job.requested_at) ?? "",
      readyAt: iso(job.ready_at),
      expiresAt,
      failureReason: job.failure_reason,
      attempts: job.attempts,
      downloadPath: status === "ready" ? `/v1/academic-evidence/exports/${job.id}/download` : null,
    };
  }

  async download(exportId: string): Promise<ExportDownload> {
    const context = this.tenantContext.require();
    const job = await this.row(exportId);
    const expiresAt = iso(job.expires_at);
    if (job.status === "expired" || (expiresAt && new Date(expiresAt).getTime() <= Date.now())) {
      throw new GoneException("Export has expired");
    }
    if (job.status !== "ready" || !job.object_key || !job.checksum) {
      throw new ConflictException("Export is not ready for download");
    }

    let response: Response;
    try {
      response = await fetch(objectStoreUrl(), {
        method: "GET",
        headers: {
          "x-veza-export-id": job.id,
          "x-veza-tenant-id": context.tenantId,
          "x-veza-object-key": job.object_key,
          ...(process.env.EXPORT_OBJECT_STORE_TOKEN?.trim()
            ? { authorization: `Bearer ${process.env.EXPORT_OBJECT_STORE_TOKEN.trim()}` }
            : {}),
        },
        signal: AbortSignal.timeout(objectStoreTimeoutMs()),
        cache: "no-store",
      });
    } catch {
      throw new BadGatewayException("Export object store is unavailable");
    }
    if (!response.ok) throw new BadGatewayException("Export object could not be retrieved");
    const expectedMediaType = mediaType(job.format);
    const actualMediaType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
    if (actualMediaType && actualMediaType !== expectedMediaType) {
      throw new BadGatewayException("Export object media type does not match its evidence");
    }
    const maximumBytes = boundedMaximumBytes();
    const contentLength = Number(response.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
      throw new BadGatewayException("Export object exceeds the download size policy");
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > maximumBytes) throw new BadGatewayException("Export object exceeds the download size policy");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    if (checksum !== job.checksum) throw new BadGatewayException("Export object failed checksum verification");
    return {
      bytes,
      mediaType: expectedMediaType,
      fileName: safeFileName(job),
      checksum,
    };
  }
}
