import { createHash } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";
import type { RecordMediaAccessibilityDto } from "./storage.dto.js";

@Injectable()
export class StorageAccessibilityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async record(assetId: string, input: RecordMediaAccessibilityDto) {
    const context = this.context.require();
    if (!input.altText && !input.transcript && !input.caption) {
      throw new BadRequestException(
        "Accessibility evidence requires alternative text, caption or transcript",
      );
    }
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const current = await client.query(
        `SELECT media_type, version, metadata
         FROM media_assets
         WHERE id = $1
         FOR UPDATE`,
        [assetId],
      );
      const asset = current.rows[0];
      if (!asset) throw new NotFoundException("Media asset was not found");
      if (Number(asset.version) !== input.expectedVersion) {
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
         WHERE id = $1
         RETURNING version`,
        [assetId, metadata],
      );
      if (input.transcript) {
        const checksum = createHash("sha256")
          .update(input.transcript, "utf8")
          .digest("hex");
        await client.query(
          `INSERT INTO media_text_tracks (
             tenant_id, asset_id, track_type, language_tag,
             inline_text, format, checksum_sha256, generated_by,
             reviewed_by, reviewed_at, status
           ) VALUES ($1,$2,'transcript','en-ZA',$3,'txt',$4,'human',$5,now(),'published')
           ON CONFLICT DO NOTHING`,
          [context.tenantId, assetId, input.transcript, checksum, context.actorId],
        );
      }
      return {
        id: assetId,
        accessibilityStatus: "complete",
        version: Number(updated.rows[0].version),
      };
    });
  }
}
