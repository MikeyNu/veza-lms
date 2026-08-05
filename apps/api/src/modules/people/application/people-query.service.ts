import { Injectable, NotFoundException } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

interface PersonRow extends QueryResultRow {
  id: string;
  version: number;
  preferred_name: string | null;
  legal_given_names: string;
  legal_family_name: string;
  date_of_birth: string | null;
  locale: string;
  linked_user_id: string | null;
  status: string;
  updated_at: string;
}

@Injectable()
export class PeopleQueryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async detail(personId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<PersonRow>(
        `SELECT id, version, preferred_name, legal_given_names, legal_family_name,
                date_of_birth, locale, linked_user_id, status, updated_at
         FROM people
         WHERE id = $1`,
        [personId],
      );
      const person = result.rows[0];
      if (!person) throw new NotFoundException("Person was not found");

      const [
        contacts,
        addresses,
        learner,
        staff,
        engagements,
        relationships,
        identifiers,
        assignments,
        consents,
        restrictions,
        identityLinks,
        dataSubjectRequests,
      ] = await Promise.all([
        client.query(
          `SELECT id,version,kind,value,label,is_primary,is_verified,
                  verification_recorded_at,valid_from,valid_until
           FROM person_contact_points
           WHERE person_id = $1
           ORDER BY valid_until NULLS FIRST,is_primary DESC,kind,created_at`,
          [personId],
        ),
        client.query(
          `SELECT id,version,address_type,address,is_primary,valid_from,valid_until
           FROM person_addresses
           WHERE person_id=$1
           ORDER BY valid_until NULLS FIRST,is_primary DESC,address_type,created_at`,
          [personId],
        ),
        client.query(
          `SELECT person_id, institution_id, status, admission_date, exit_date
           FROM learner_profiles
           WHERE person_id = $1`,
          [personId],
        ),
        client.query(
          `SELECT person_id, institution_id, status, engagement_type,
                  employee_number, started_on, ended_on
           FROM staff_profiles
           WHERE person_id = $1`,
          [personId],
        ),
        client.query(
          `SELECT id,version,institution_id,organisational_unit_id,engagement_type,
                  employee_number,title,status,started_on,ended_on
           FROM staff_engagements
           WHERE person_id=$1
           ORDER BY started_on DESC,created_at DESC`,
          [personId],
        ),
        client.query(
          `SELECT id, version, institution_id, related_person_id,
                  relationship_type, authority, valid_from, valid_until,
                  verified_at, revoked_at
           FROM person_relationships
           WHERE subject_person_id = $1
           ORDER BY created_at DESC`,
          [personId],
        ),
        client.query(
          `SELECT id,version,institution_id,identifier_type,identifier_value,
                  issuing_authority,valid_from,valid_until
           FROM person_identifiers
           WHERE person_id=$1
           ORDER BY valid_until NULLS FIRST,identifier_type,created_at`,
          [personId],
        ),
        client.query(
          `SELECT id,version,institution_id,organisational_unit_id,assignment_type,
                  title,is_primary,valid_from,valid_until
           FROM person_organisational_assignments
           WHERE person_id=$1
           ORDER BY valid_until NULLS FIRST,is_primary DESC,valid_from DESC`,
          [personId],
        ),
        client.query(
          `SELECT id,version,relationship_id,purpose_code,status,evidence,
                  granted_at,expires_at,withdrawn_at
           FROM person_consents
           WHERE person_id=$1
           ORDER BY created_at DESC`,
          [personId],
        ),
        client.query(
          `SELECT id,version,restriction_code,reason,applies_to_relationship_types,
                  effective_from,effective_until,lifted_at
           FROM person_disclosure_restrictions
           WHERE person_id=$1
           ORDER BY effective_from DESC,created_at DESC`,
          [personId],
        ),
        client.query(
          `SELECT id,institution_id,membership_invitation_id,requested_email,
                  requested_role_key,status,linked_user_id,expires_at,completed_at,version
           FROM person_identity_link_requests
           WHERE person_id=$1
           ORDER BY created_at DESC`,
          [personId],
        ),
        client.query(
          `SELECT id,person_id,request_type,status,reason,export_format,export_checksum,
                  requested_at,ready_at,delivered_at,version
           FROM person_data_subject_requests
           WHERE person_id=$1
           ORDER BY requested_at DESC`,
          [personId],
        ),
      ]);

      return {
        ...person,
        contacts: contacts.rows,
        addresses: addresses.rows,
        learner: learner.rows[0] ?? null,
        staff: staff.rows[0] ?? null,
        staff_engagements: engagements.rows,
        relationships: relationships.rows,
        identifiers: identifiers.rows,
        organisational_assignments: assignments.rows,
        consents: consents.rows,
        disclosure_restrictions: restrictions.rows,
        identity_link_requests: identityLinks.rows,
        data_subject_requests: dataSubjectRequests.rows,
      };
    });
  }
}
