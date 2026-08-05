import { Module } from "@nestjs/common";
import { PeopleService } from "./application/people.service.js";
import { PeopleController } from "./http/people.controller.js";

@Module({
  controllers: [PeopleController],
  providers: [PeopleService],
  exports: [PeopleService],
})
export class PeopleModule {}
