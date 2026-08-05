import { BadRequestException, Injectable } from "@nestjs/common";
import type { BaselineRoleKey, MembershipId, MembershipStatus } from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type { ListAccessDirectoryDto } from "./access-administration.dto.js";

interface MembershipRow extends QueryResultRow {
  readonly id: string;
  readonly user_id: string;
  readonly display_name: string | null;
  readonly email: string | null;
  readonly status: MembershipStatus;
  readonly locale: string;
  readonly timezone: string;
  readonly created_at: Date;
  readonly roles: readonly RoleRow[];
}

interface RoleRow {
  readonly id: string;
  readonly roleKey: BaselineRoleKey;
  readonly scopeType: "tenant" | "institution";
  readonly scopeId: string;
  readonly scopeLabel: string | null;
  readonly validFrom: string;
  readonly validUntil: string | null;
}

interface InvitationRow extends QueryResultRow {
  readonly id: string;
  readonly email: string;
  readonly role_key: BaselineRoleKey;
  readonly scope_type: "tenant" | "institution";
  readonly scope_id: string;
  readonly scope_label: string | null;
  readonly status: "pending-delivery" | "sent" | "accepted" | "expired" | "revoked";
  readonly expires_at: Date;
  readonly created_at: Date;
}

interface DirectoryCursor {
  readonly createdAt: string;
  readonly id: string;
}

export interface AccessDirectoryMembership {
  readonly id: MembershipId;
  readonly userId: string;
  readonly identity: { readonly displayName?: string; readonly email?: string };
  readonly status: MembershipStatus;
  readonly locale: string;
  readonly timezone: string;
  readonly createdAt: string;
  readonly roles: readonly RoleRow[];
}

export interface AccessDirectoryInvitation {
  readonly id: string;
  readonly email: string;
  readonly roleKey: BaselineRoleKey;
  readonly scopeType: "tenant" | "institution";
  readonly scopeId: string;
  readonly scopeLabel?: string;
  readonly status: InvitationRow["status"];
  readonly expiresAt: string;
  readonly createdAt: string;
}

export interface AccessDirectoryPage {
  readonly memberships: readonly AccessDirectoryMembership[];
  readonly invitations: readonly AccessDirectoryInvitation[];
  readonly page: { readonly limit: number; readonly nextCursor?: string };
}

function encodeCursor(value: DirectoryCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string): DirectoryCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<DirectoryCursor>;
    if (!parsed.createdAt || !Number.isFinite(Date.parse(parsed.createdAt)) || !parsed.id || !/^[0-9a-f-]{36}$/i.test(parsed.id)) throw new Error();
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    throw new BadRequestException("Access-directory cursor is invalid");
  }
}

@Injectable()
export class AccessDirectoryQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  async list(input: ListAccessDirectoryDto): Promise<AccessDirectoryPage> {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const values: unknown[] = [context.tenantId];
      const conditions: string[] = ["membership.tenant_id = $1"];
      const bind = (value: unknown): string => {
        values.push(value);
        return `$${values.length}`;
      };
      if (input.query) {
        const escaped = `%${input.query.replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
        const parameter = bind(escaped);
        conditions.push(`(identity.display_name ILIKE ${parameter} ESCAPE '\\' OR identity.email::text ILIKE ${parameter} ESCAPE '\\')`);
      }
      if (input.status) conditions.push(`membership.status = ${bind(input.status)}`);
      if (input.roleKey) {
        conditions.push(`EXISTS (
          SELECT 1 FROM role_assignments filter_role
          WHERE filter_role.tenant_id = membership.tenant_id
            AND filter_role.membership_id = membership.id
            AND filter_role.role_key = ${bind(input.roleKey)}
            AND filter_role.valid_from <= now()
            AND (filter_role.valid_until IS NULL OR filter_role.valid_until > now())
        )`);
      }
      if (input.institutionId) {
        conditions.push(`EXISTS (
          SELECT 1 FROM role_assignments institution_role
          WHERE institution_role.tenant_id = membership.tenant_id
            AND institution_role.membership_id = membership.id
            AND institution_role.scope_type = 'institution'
            AND institution_role.scope_id = ${bind(input.institutionId)}::uuid
            AND institution_role.valid_from <= now()
            AND (institution_role.valid_until IS NULL OR institution_role.valid_until > now())
        )`);
      }
      const cursor = input.cursor ? decodeCursor(input.cursor) : undefined;
      if (cursor) {
        const createdAt = bind(cursor.createdAt);
        const id = bind(cursor.id);
        conditions.push(`(membership.created_at, membership.id) < (${createdAt}::timestamptz, ${id}::uuid)`);
      }
      const limitParameter = bind(input.limit + 1);
      const institutionParameter = bind(input.institutionId ?? null);
      const membershipResult = await client.query<MembershipRow>(
        `SELECT membership.id, membership.user_id, identity.display_name,
                identity.email::text AS email, membership.status, membership.locale,
                membership.timezone, membership.created_at,
                COALESCE((
                  SELECT jsonb_agg(jsonb_build_object(
                    'id', role.id,
                    'roleKey', role.role_key,
                    'scopeType', role.scope_type,
                    'scopeId', role.scope_id,
                    'scopeLabel', CASE
                      WHEN role.scope_type = 'tenant' THEN tenant.display_name
                      WHEN role.scope_type = 'institution' THEN institution.display_name
                      ELSE NULL
                    END,
                    'validFrom', role.valid_from,
                    'validUntil', role.valid_until
                  ) ORDER BY role.role_key, role.scope_type, role.scope_id)
                  FROM role_assignments role
                  LEFT JOIN institutions institution
                    ON role.scope_type = 'institution'
                   AND institution.tenant_id = role.tenant_id
                   AND institution.id = role.scope_id
                  WHERE role.tenant_id = membership.tenant_id
                    AND role.membership_id = membership.id
                    AND role.valid_from <= now()
                    AND (role.valid_until IS NULL OR role.valid_until > now())
                    AND (${institutionParameter}::uuid IS NULL OR (
                      role.scope_type = 'institution' AND role.scope_id = ${institutionParameter}::uuid
                    ))
                ), '[]'::jsonb) AS roles
         FROM memberships membership
         JOIN users identity ON identity.id = membership.user_id
         JOIN tenants tenant ON tenant.id = membership.tenant_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY membership.created_at DESC, membership.id DESC
         LIMIT ${limitParameter}`,
        values,
      );
      const hasMore = membershipResult.rows.length > input.limit;
      const rows = hasMore ? membershipResult.rows.slice(0, input.limit) : membershipResult.rows;
      const last = rows.at(-1);

      const invitationValues: unknown[] = [context.tenantId, input.institutionId ?? null];
      const invitationResult = await client.query<InvitationRow>(
        `SELECT invitation.id, invitation.email::text, invitation.role_key,
                invitation.scope_type, invitation.scope_id,
                CASE
                  WHEN invitation.scope_type = 'tenant' THEN tenant.display_name
                  WHEN invitation.scope_type = 'institution' THEN institution.display_name
                  ELSE NULL
                END AS scope_label,
                invitation.status, invitation.expires_at, invitation.created_at
         FROM membership_invitations invitation
         JOIN tenants tenant ON tenant.id = invitation.tenant_id
         LEFT JOIN institutions institution
           ON invitation.scope_type = 'institution'
          AND institution.tenant_id = invitation.tenant_id
          AND institution.id = invitation.scope_id
         WHERE invitation.tenant_id = $1
           AND invitation.status IN ('pending-delivery','sent')
           AND ($2::uuid IS NULL OR (invitation.scope_type = 'institution' AND invitation.scope_id = $2::uuid))
         ORDER BY invitation.created_at DESC, invitation.id DESC
         LIMIT 100`,
        invitationValues,
      );

      return {
        memberships: rows.map((row) => ({
          id: row.id as MembershipId,
          userId: row.user_id,
          identity: {
            ...(row.display_name ? { displayName: row.display_name } : {}),
            ...(row.email ? { email: row.email } : {}),
          },
          status: row.status,
          locale: row.locale,
          timezone: row.timezone,
          createdAt: row.created_at.toISOString(),
          roles: row.roles ?? [],
        })),
        invitations: invitationResult.rows.map((row) => ({
          id: row.id,
          email: row.email,
          roleKey: row.role_key,
          scopeType: row.scope_type,
          scopeId: row.scope_id,
          ...(row.scope_label ? { scopeLabel: row.scope_label } : {}),
          status: row.status,
          expiresAt: row.expires_at.toISOString(),
          createdAt: row.created_at.toISOString(),
        })),
        page: {
          limit: input.limit,
          ...(hasMore && last ? { nextCursor: encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id }) } : {}),
        },
      };
    });
  }
}
