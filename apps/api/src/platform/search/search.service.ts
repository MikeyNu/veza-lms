import { createHash } from "node:crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import type { TenantMembershipSummary } from "@veza/contracts";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";
import type { SearchQueryDto } from "./search.dto.js";

interface SearchCursor {
  readonly score: number;
  readonly title: string;
  readonly id: string;
}

function encodeCursor(cursor: SearchCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): SearchCursor | undefined {
  if (!value) return undefined;
  try {
    const decoded = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as SearchCursor;
    if (
      typeof decoded.score !== "number" ||
      typeof decoded.title !== "string" ||
      typeof decoded.id !== "string"
    ) {
      throw new Error("invalid cursor");
    }
    return decoded;
  } catch {
    throw new BadRequestException("Search cursor is invalid");
  }
}

@Injectable()
export class SearchService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async search(input: SearchQueryDto, membership: TenantMembershipSummary) {
    const context = this.context.require();
    const startedAt = Date.now();
    const query = input.query.trim().replace(/\s+/g, " ");
    const limit = input.limit ?? 20;
    const cursor = decodeCursor(input.cursor);
    if (input.institutionId && !membership.roles.includes("tenant-owner")) {
      if (!membership.institutionIds.includes(input.institutionId)) {
        throw new BadRequestException("Search institution is outside the active membership scope");
      }
    }
    const result = await this.database.withTenantTransaction(context.tenantId, async (client) => {
      const synonyms = query
        ? await client.query<{ synonym: string }>(
            `SELECT unnest(synonyms) synonym
             FROM search_synonyms
             WHERE status = 'active' AND lower(term) = lower($1)
             LIMIT 20`,
            [query],
          )
        : { rows: [] as { synonym: string }[] };
      const expanded = [query, ...synonyms.rows.map((row) => row.synonym)]
        .filter(Boolean)
        .join(" OR ");
      const rows = await client.query(
        `WITH candidates AS (
           SELECT document.*,
                  CASE
                    WHEN $1 = '' THEN document.suggestion_weight::numeric / 100
                    ELSE ts_rank_cd(
                           document.search_vector,
                           websearch_to_tsquery('simple',$2),
                           32
                         )
                         + CASE WHEN lower(document.title) LIKE lower($1) || '%' THEN 2 ELSE 0 END
                         + document.suggestion_weight::numeric / 1000
                  END score
           FROM search_documents document
           WHERE document.status = 'active'
             AND document.allowed_roles && $3::text[]
             AND (
               $4::boolean OR
               document.institution_id IS NULL OR
               document.institution_id = ANY($5::uuid[])
             )
             AND ($6::uuid IS NULL OR document.institution_id = $6)
             AND (
               cardinality($7::text[]) = 0 OR document.entity_type = ANY($7::text[])
             )
             AND (
               $1 = '' OR
               document.search_vector @@ websearch_to_tsquery('simple',$2) OR
               lower(document.title) LIKE '%' || lower($1) || '%' OR
               EXISTS (
                 SELECT 1 FROM unnest(document.keywords) keyword
                 WHERE lower(keyword) LIKE lower($1) || '%'
               )
             )
         ), page AS (
           SELECT * FROM candidates
           WHERE (
             $8::numeric IS NULL OR
             score < $8 OR
             (score = $8 AND lower(title) > lower($9)) OR
             (score = $8 AND lower(title) = lower($9) AND id > $10::uuid)
           )
           ORDER BY score DESC, lower(title), id
           LIMIT $11
         )
         SELECT id, document_key, entity_type, entity_id, institution_id,
                title, subtitle,
                CASE WHEN $1 = '' THEN left(body,240)
                     ELSE ts_headline(
                       'simple', body, websearch_to_tsquery('simple',$2),
                       'StartSel=<mark>,StopSel=</mark>,MaxFragments=2,MaxWords=28,MinWords=10'
                     ) END excerpt,
                metadata, visibility, score, updated_at
         FROM page
         ORDER BY score DESC, lower(title), id`,
        [
          query,
          expanded || query || "*",
          membership.roles,
          membership.roles.includes("tenant-owner"),
          membership.institutionIds,
          input.institutionId ?? null,
          input.entityTypes ?? [],
          cursor?.score ?? null,
          cursor?.title ?? "",
          cursor?.id ?? null,
          limit + 1,
        ],
      );
      const hasMore = rows.rows.length > limit;
      const page = hasMore ? rows.rows.slice(0, limit) : rows.rows;
      const last = page.at(-1);
      const latencyMs = Date.now() - startedAt;
      await client.query(
        `INSERT INTO search_query_events (
           tenant_id, actor_id, query_hash, query_length,
           filters, result_count, latency_ms
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          context.tenantId,
          context.actorId,
          createHash("sha256").update(query.toLowerCase(), "utf8").digest("hex"),
          query.length,
          {
            entityTypes: input.entityTypes ?? [],
            institutionId: input.institutionId ?? null,
          },
          page.length,
          latencyMs,
        ],
      );
      return {
        items: page.map((row) => ({
          id: row.id,
          documentKey: row.document_key,
          entityType: row.entity_type,
          entityId: row.entity_id,
          institutionId: row.institution_id,
          title: row.title,
          subtitle: row.subtitle,
          excerpt: row.excerpt,
          metadata: row.metadata,
          visibility: row.visibility,
          score: Number(row.score),
          updatedAt: row.updated_at,
        })),
        nextCursor:
          hasMore && last
            ? encodeCursor({
                score: Number(last.score),
                title: String(last.title),
                id: String(last.id),
              })
            : undefined,
        latencyMs,
      };
    });
    return {
      query,
      generatedAt: new Date().toISOString(),
      ...result,
    };
  }
}
