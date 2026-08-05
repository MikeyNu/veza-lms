import { Injectable } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";

interface ServiceAccountRow extends QueryResultRow {
  readonly id: string;
  readonly client_id: string;
  readonly display_name: string;
  readonly scopes: string[];
  readonly allowed_ip_cidrs: string[];
  readonly token_ttl_seconds: number;
  readonly status: "active" | "suspended" | "retired";
  readonly version: number;
  readonly last_used_at: Date | null;
  readonly created_at: Date;
  readonly updated_at: Date;
  readonly principal_user_id: string;
  readonly principal_email: string | null;
  readonly principal_display_name: string | null;
  readonly secret_prefix: string | null;
  readonly secret_created_at: Date | null;
}

@Injectable()
export class ServiceAccountQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async list() {
    const context = this.context.require();
    const result = await this.database.withTenantTransaction(context.tenantId, (client) =>
      client.query<ServiceAccountRow>(
        `SELECT account.id, account.client_id, account.display_name, account.scopes,
                account.allowed_ip_cidrs::text[] allowed_ip_cidrs,
                account.token_ttl_seconds, account.status, account.version,
                account.last_used_at, account.created_at, account.updated_at,
                account.principal_user_id, principal.email principal_email,
                principal.display_name principal_display_name,
                secret.secret_prefix, secret.created_at secret_created_at
         FROM service_accounts account
         JOIN users principal ON principal.id = account.principal_user_id
         LEFT JOIN LATERAL (
           SELECT value.secret_prefix, value.created_at
           FROM service_account_secrets value
           WHERE value.service_account_id = account.id
             AND value.status = 'active'
           ORDER BY value.created_at DESC, value.id DESC
           LIMIT 1
         ) secret ON true
         WHERE account.tenant_id = $1
         ORDER BY account.status = 'active' DESC,
                  account.updated_at DESC,
                  account.id`,
        [context.tenantId],
      ),
    );

    return {
      items: result.rows.map((row) => ({
        id: row.id,
        clientId: row.client_id,
        displayName: row.display_name,
        scopes: row.scopes,
        allowedIpCidrs: row.allowed_ip_cidrs,
        tokenTtlSeconds: row.token_ttl_seconds,
        status: row.status,
        version: row.version,
        lastUsedAt: row.last_used_at?.toISOString(),
        createdAt: row.created_at.toISOString(),
        updatedAt: row.updated_at.toISOString(),
        principal: {
          userId: row.principal_user_id,
          email: row.principal_email ?? undefined,
          displayName: row.principal_display_name ?? undefined,
        },
        activeSecret: row.secret_prefix
          ? {
              prefix: row.secret_prefix,
              createdAt: row.secret_created_at?.toISOString(),
            }
          : undefined,
      })),
    };
  }
}
