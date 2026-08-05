import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";

@Injectable()
export class PeopleInstitutionBoundaryService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async assertPersonInInstitution(personId: string, institutionId: string): Promise<void> {
    const context = this.context.require();
    await this.database.withTenantTransaction(context.tenantId, async (client) => {
      const institution = await client.query(
        "SELECT id FROM institutions WHERE id=$1 AND status='active'",
        [institutionId],
      );
      if (!institution.rowCount) throw new NotFoundException("Active institution was not found");
      const person = await client.query(
        `SELECT person.id
         FROM people person
         WHERE person.id=$1 AND person.status <> 'merged'
           AND (
             EXISTS (SELECT 1 FROM learner_profiles profile WHERE profile.person_id=person.id AND profile.institution_id=$2)
             OR EXISTS (SELECT 1 FROM staff_profiles profile WHERE profile.person_id=person.id AND profile.institution_id=$2)
             OR EXISTS (SELECT 1 FROM person_organisational_assignments assignment WHERE assignment.person_id=person.id AND assignment.institution_id=$2)
             OR EXISTS (SELECT 1 FROM person_relationships relationship
                        WHERE relationship.institution_id=$2
                          AND (relationship.subject_person_id=person.id OR relationship.related_person_id=person.id))
           )`,
        [personId, institutionId],
      );
      if (!person.rowCount) {
        throw new ForbiddenException("Person is not associated with the authorised institution");
      }
    });
  }
}
