import { Global, Module } from "@nestjs/common";
import { AuditQueryService } from "./application/audit-query.service.js";
import { AuditWriter } from "./audit-writer.service.js";
import { AuditEventsController } from "./http/audit-events.controller.js";

@Global()
@Module({
  controllers: [AuditEventsController],
  providers: [AuditWriter, AuditQueryService],
  exports: [AuditWriter, AuditQueryService],
})
export class AuditModule {}
