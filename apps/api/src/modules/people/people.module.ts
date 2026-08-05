import { Module } from "@nestjs/common";
import { InstitutionRelationshipService } from "./application/institution-relationship.service.js";
import { PeopleIntegrityService } from "./application/people-integrity.service.js";
import { PeopleQueryService } from "./application/people-query.service.js";
import { PeopleService } from "./application/people.service.js";
import { PeopleController } from "./http/people.controller.js";

@Module({
  controllers: [PeopleController],
  providers: [
    PeopleService,
    PeopleIntegrityService,
    PeopleQueryService,
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
