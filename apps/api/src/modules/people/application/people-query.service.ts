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

      const [contacts, learner, staff, relationships, identifiers] = await Promise.all([
        client.query(
          `SELECT id, kind, value, label, is_primary, is_verified,
                  verification_recorded_at
           FROM person_contact_points
           WHERE person_id = $1 AND valid_until IS NULL
           ORDER BY is_primary DESC, kind`,
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
          `SELECT id, version, institution_id, related_person_id,
                  relationship_type, authority, valid_from, valid_until,
                  verified_at, revoked_at
           FROM person_relationships
           WHERE subject_person_id = $1
           ORDER BY created_at DESC`,
          [personId],
        ),
        client.query(
          `SELECT identifier_value
           FROM person_identifiers
           WHERE person_id = $1 AND valid_until IS NULL
           ORDER BY identifier_type`,
          [personId],
        ),
      ]);

      return {
        ...person,
        contacts: contacts.rows,
        learner: learner.rows[0] ?? null,
        staff: staff.rows[0] ?? null,
        relationships: relationships.rows,
        identifiers: identifiers.rows.map((row) => row.identifier_value),
      };
    });
  }
}
