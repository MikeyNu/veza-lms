import { Injectable, NotFoundException } from "@nestjs/common";
import type { InstitutionId } from "@veza/contracts";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

@Injectable()
export class InstitutionQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly tenantContext: TenantContext,
  ) {}

  async institutionOverview(institutionId: InstitutionId) {
    const context = this.tenantContext.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const institution = await client.query(
        `SELECT id, code, display_name, legal_name, institution_type, status,
                locale, timezone, contact_email, updated_at
         FROM institutions
         WHERE tenant_id = $1 AND id = $2 AND status <> 'archived'`,
        [context.tenantId, institutionId],
      );
      const row = institution.rows[0];
      if (!row) throw new NotFoundException("Institution was not found in this tenant");

      const [campuses, units, periods, policies] = await Promise.all([
        client.query(
          `SELECT id, code, display_name, delivery_mode, status, is_primary, timezone, address
           FROM campuses
           WHERE tenant_id = $1 AND institution_id = $2 AND status <> 'archived'
           ORDER BY is_primary DESC, display_name`,
          [context.tenantId, institutionId],
        ),
        client.query(
          `SELECT id, parent_unit_id, code, display_name, unit_type, status
           FROM organisational_units
           WHERE tenant_id = $1 AND institution_id = $2 AND status <> 'archived'
           ORDER BY display_name`,
          [context.tenantId, institutionId],
        ),
        client.query(
          `SELECT id, parent_period_id, code, display_name, period_type, status,
                  starts_on::text, ends_on::text, teaching_starts_on::text,
                  teaching_ends_on::text, timezone, published_at
           FROM academic_periods
           WHERE tenant_id = $1 AND institution_id = $2 AND status <> 'archived'
           ORDER BY starts_on, ends_on, display_name`,
          [context.tenantId, institutionId],
        ),
        client.query(
          `SELECT id, policy_key, version, status, title, content_checksum,
                  effective_from::text, effective_until::text, approved_at
           FROM institutional_policies
           WHERE tenant_id = $1 AND institution_id = $2
           ORDER BY policy_key, version DESC`,
          [context.tenantId, institutionId],
        ),
      ]);

      return {
        institution: row,
        campuses: campuses.rows,
        organisationalUnits: units.rows,
        academicPeriods: periods.rows,
        policies: policies.rows,
      };
    });
  }
}
