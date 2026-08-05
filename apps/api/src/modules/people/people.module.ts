import { Module } from "@nestjs/common";
import { PeopleIntegrityService } from "./application/people-integrity.service.js";
import { PeopleQueryService } from "./application/people-query.service.js";
import { PeopleService } from "./application/people.service.js";
import { PeopleController } from "./http/people.controller.js";

@Module({
  controllers: [PeopleController],
  providers: [PeopleService, PeopleIntegrityService, PeopleQueryService],
  exports: [PeopleService, PeopleIntegrityService, PeopleQueryService],
})
export class PeopleModule {}
