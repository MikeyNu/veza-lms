import { Module } from "@nestjs/common";
import { StudioLibraryService } from "./application/studio-library.service.js";
import { StudioService } from "./application/studio.service.js";
import { StudioController } from "./http/studio.controller.js";

@Module({
  controllers: [StudioController],
  providers: [StudioService, StudioLibraryService],
  exports: [StudioService, StudioLibraryService],
})
export class StudioModule {}
