import { Module } from "@nestjs/common";
import { PeopleIntegrityService } from "./application/people-integrity.service.js";
import { PeopleService } from "./application/people.service.js";
import { PeopleController } from "./http/people.controller.js";

@Module({
  controllers: [PeopleController],
  providers: [PeopleService, PeopleIntegrityService],
  exports: [PeopleService, PeopleIntegrityService],
})
export class PeopleModule {}
