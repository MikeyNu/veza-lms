import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type {
  RecordStudioAssetScanDto,
  RegisterStudioAssetDto,
} from "./studio.dto.js";

@Injectable()
export class StudioLibraryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async library(institutionId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const [blocks, assets, publications, imports] = await Promise.all([
        client.query(
          `SELECT id,name,block_type "blockType",content,status,version,updated_at "updatedAt"
           FROM studio_reusable_blocks
           WHERE institution_id=$1 AND status<>'retired'
           ORDER BY updated_at DESC,name`,
          [institutionId],
        ),
        client.query(
          `SELECT id,course_space_id "courseSpaceId",asset_kind "assetKind",
                  object_key "objectKey",original_filename "originalFilename",
                  media_type "mediaType",size_bytes "sizeBytes",
                  checksum_sha256 "checksumSha256",malware_status "malwareStatus",
                  alt_text "altText",caption_text "captionText",
                  transcript_text "transcriptText",duration_seconds "durationSeconds",
                  metadata,status,version,created_at "createdAt",updated_at "updatedAt"
           FROM studio_assets WHERE institution_id=$1 AND status<>'deleted'
           ORDER BY created_at DESC LIMIT 500`,
          [institutionId],
        ),
        client.query(
          `SELECT snapshot.id,snapshot.course_space_id "courseSpaceId",space.title "courseTitle",
                  snapshot.publication_number "publicationNumber",snapshot.source_review_id "sourceReviewId",
                  snapshot.checksum_sha256 "checksumSha256",snapshot.status,
                  snapshot.supersedes_snapshot_id "supersedesSnapshotId",
                  snapshot.rollback_of_snapshot_id "rollbackOfSnapshotId",
                  snapshot.published_at "publishedAt"
           FROM studio_publication_snapshots snapshot
           JOIN studio_course_spaces space ON space.id=snapshot.course_space_id
           WHERE snapshot.institution_id=$1
           ORDER BY snapshot.published_at DESC LIMIT 250`,
          [institutionId],
        ),
        client.query(
          `SELECT id,course_space_id "courseSpaceId",source_format "sourceFormat",
                  source_checksum "sourceChecksum",compatibility_status "compatibilityStatus",
                  report,created_at "createdAt"
           FROM studio_import_reports WHERE institution_id=$1
           ORDER BY created_at DESC LIMIT 100`,
          [institutionId],
        ),
      ]);
      return {
        institutionId,
        reusableBlocks: blocks.rows,
        assets: assets.rows,
        publications: publications.rows,
        importReports: imports.rows,
      };
    });
  }

  async registerAsset(institutionId: string, input: RegisterStudioAssetDto) {
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const institution = await client.query(
        "SELECT 1 FROM institutions WHERE id=$1 AND status='active'",
        [institutionId],
      );
      if (!institution.rowCount) throw new NotFoundException("Active institution was not found");
      if (input.courseSpaceId) {
        const space = await client.query(
          "SELECT 1 FROM studio_course_spaces WHERE id=$1 AND institution_id=$2 AND status<>'retired'",
          [input.courseSpaceId, institutionId],
        );
        if (!space.rowCount) throw new BadRequestException("Asset course space is unavailable");
      }
      this.validateAccessibility(input);
      await client.query(
        `INSERT INTO studio_assets (
          id,tenant_id,institution_id,course_space_id,asset_kind,object_key,
          original_filename,media_type,size_bytes,checksum_sha256,alt_text,
          caption_text,transcript_text,duration_seconds,metadata,created_by,updated_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$16)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.courseSpaceId ?? null,
          input.assetKind,
          input.objectKey,
          input.originalFilename.trim(),
          input.mediaType,
          input.sizeBytes,
          input.checksumSha256,
          input.altText?.trim() ?? null,
          input.captionText?.trim() ?? null,
          input.transcriptText?.trim() ?? null,
          input.durationSeconds ?? null,
          input.metadata ?? {},
          context.actorId,
        ],
      );
      await this.record(client, "studio.asset.registered", "studio-asset", id, {
        institutionId,
        courseSpaceId: input.courseSpaceId,
        assetKind: input.assetKind,
        checksumSha256: input.checksumSha256,
        version: 1,
      });
      return { id, status: "processing", malwareStatus: "pending", version: 1 };
    });
  }

  async recordScan(institutionId: string, assetId: string, input: RecordStudioAssetScanDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{
        asset_kind: string;
        alt_text: string | null;
        caption_text: string | null;
        transcript_text: string | null;
        version: number;
      } & QueryResultRow>(
        `SELECT asset_kind,alt_text,caption_text,transcript_text,version
         FROM studio_assets WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [assetId, institutionId],
      );
      const asset = result.rows[0];
      if (!asset) throw new NotFoundException("Studio asset was not found");
      if (input.malwareStatus === "clean") {
        this.validateReadyEvidence(asset.asset_kind, asset.alt_text, asset.caption_text, asset.transcript_text);
      }
      const status = input.malwareStatus === "clean" ? "ready" : "quarantined";
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE studio_assets SET malware_status=$3,status=$4,
          metadata=metadata || jsonb_build_object('scanEvidence',$5::jsonb),
          version=version+1,updated_by=$6,updated_at=now()
         WHERE id=$1 AND version=$2 RETURNING version`,
        [assetId, asset.version, input.malwareStatus, status, JSON.stringify(input.scanEvidence), context.actorId],
      );
      if (!updated.rowCount) throw new ConflictException("Studio asset changed during scan processing");
      await this.record(client, "studio.asset.scan-recorded", "studio-asset", assetId, {
        malwareStatus: input.malwareStatus,
        status,
        version: updated.rows[0].version,
      });
      return { id: assetId, malwareStatus: input.malwareStatus, status, version: updated.rows[0].version };
    });
  }

  private validateAccessibility(input: RegisterStudioAssetDto): void {
    this.validateReadyEvidence(
      input.assetKind,
      input.altText ?? null,
      input.captionText ?? null,
      input.transcriptText ?? null,
      false,
    );
  }

  private validateReadyEvidence(
    kind: string,
    altText: string | null,
    captionText: string | null,
    transcriptText: string | null,
    strict = true,
  ): void {
    if (kind === "image" && !altText?.trim()) {
      throw new BadRequestException("Meaningful images require alternative text");
    }
    if (["video", "audio"].includes(kind) && !captionText?.trim() && !transcriptText?.trim()) {
      throw new BadRequestException("Audio and video require captions or a transcript");
    }
    if (strict && ["document", "archive"].includes(kind) && !captionText?.trim()) {
      throw new BadRequestException("Downloadable resources require a descriptive caption");
    }
  }

  private async record(
    client: PoolClient,
    eventType: string,
    resourceType: string,
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
      resourceType,
      resourceId,
      correlationId: context.correlationId,
      afterState,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      aggregateType: resourceType,
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
