import { Global, Module } from "@nestjs/common";
import { EventOperationsController } from "./event-operations.controller.js";
import { EventOperationsService } from "./event-operations.service.js";
import { OutboxWriter } from "./outbox-writer.service.js";

@Global()
@Module({
  controllers: [EventOperationsController],
  providers: [OutboxWriter, EventOperationsService],
  exports: [OutboxWriter, EventOperationsService],
})
export class EventsModule {}
