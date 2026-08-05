import { Module } from "@nestjs/common";
import { StudioService } from "./application/studio.service.js";
import { StudioController } from "./http/studio.controller.js";

@Module({
  controllers: [StudioController],
  providers: [StudioService],
  exports: [StudioService],
})
export class StudioModule {}
