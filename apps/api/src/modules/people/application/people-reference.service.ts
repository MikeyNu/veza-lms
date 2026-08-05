import { Injectable, NotFoundException } from "@nestjs/common";
import type { PeopleOperationReferences } from "@veza/contracts";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

@Injectable()
export class PeopleReferenceService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async load(institutionId: string): Promise<PeopleOperationReferences> {
    const context = this.context.require();
    const organisationalUnits = await this.database.withTenantTransaction(
      context.tenantId,
      async (client) => {
        const institution = await client.query(
          "SELECT id FROM institutions WHERE id=$1 AND status='active'",
          [institutionId],
        );
        if (!institution.rowCount) {
          throw new NotFoundException("Active institution was not found");
        }
        return client.query(
          `SELECT id,code,display_name,unit_type
           FROM organisational_units
           WHERE institution_id=$1 AND status='active'
           ORDER BY display_name,code`,
          [institutionId],
        );
      },
    );
    const identities = await this.database.controlPlaneQuery(
      `SELECT user_record.id user_id,user_record.display_name,user_record.email,
              array_agg(DISTINCT assignment.role_key ORDER BY assignment.role_key) roles
       FROM users user_record
       JOIN memberships membership
         ON membership.user_id=user_record.id AND membership.tenant_id=$1
       JOIN role_assignments assignment
         ON assignment.membership_id=membership.id AND assignment.tenant_id=membership.tenant_id
       WHERE membership.status='active'
         AND (membership.valid_until IS NULL OR membership.valid_until > now())
         AND assignment.valid_from <= now()
         AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
         AND ((assignment.scope_type='tenant' AND assignment.scope_id=$1)
           OR (assignment.scope_type='institution' AND assignment.scope_id=$2))
       GROUP BY user_record.id,user_record.display_name,user_record.email
       ORDER BY user_record.display_name NULLS LAST,user_record.email`,
      [context.tenantId, institutionId],
    );
    return {
      institutionId,
      organisationalUnits: organisationalUnits.rows.map((row) => ({
        id: row.id,
        code: row.code,
        displayName: row.display_name,
        unitType: row.unit_type,
      })),
      linkableIdentities: identities.rows.map((row) => ({
        userId: row.user_id,
        displayName: row.display_name ?? row.email,
        email: row.email ?? undefined,
        roles: row.roles ?? [],
      })),
    };
  }
}
