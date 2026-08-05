import { Module } from "@nestjs/common";
import { IdentityAccessModule } from "../identity-access/identity-access.module.js";
import { InstitutionRelationshipService } from "./application/institution-relationship.service.js";
import { PeopleIdentityLinkService } from "./application/people-identity-link.service.js";
import { PeopleInstitutionBoundaryService } from "./application/people-institution-boundary.service.js";
import { PeopleIntegrityService } from "./application/people-integrity.service.js";
import { PeopleOperationsService } from "./application/people-operations.service.js";
import { PeopleQueryService } from "./application/people-query.service.js";
import { PeopleReferenceService } from "./application/people-reference.service.js";
import { PeopleService } from "./application/people.service.js";
import { PeopleOperationsController } from "./http/people-operations.controller.js";
import { PeopleReferenceController } from "./http/people-reference.controller.js";
import { PeopleController } from "./http/people.controller.js";

@Module({
  imports: [IdentityAccessModule],
  controllers: [
    PeopleController,
    PeopleOperationsController,
    PeopleReferenceController,
  ],
  providers: [
    PeopleService,
    PeopleIntegrityService,
    PeopleQueryService,
    PeopleOperationsService,
    PeopleIdentityLinkService,
    PeopleInstitutionBoundaryService,
    PeopleReferenceService,
    InstitutionRelationshipService,
  ],
  exports: [
    PeopleService,
    PeopleIntegrityService,
    PeopleQueryService,
    InstitutionRelationshipService,
  ],
})
export class PeopleModule {}
