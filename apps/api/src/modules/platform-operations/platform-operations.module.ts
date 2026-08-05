import { Module } from "@nestjs/common";
import { PlatformAuditQueryService } from "./application/platform-audit-query.service.js";
import { PlatformAuditWriter } from "./application/platform-audit-writer.service.js";
import { PlatformAuditController } from "./http/platform-audit.controller.js";

@Module({
  controllers: [PlatformAuditController],
  providers: [PlatformAuditQueryService, PlatformAuditWriter],
  exports: [PlatformAuditWriter],
})
export class PlatformOperationsModule {}
