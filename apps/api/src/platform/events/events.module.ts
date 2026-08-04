import { Global, Module } from "@nestjs/common";
import { OutboxWriter } from "./outbox-writer.service.js";

@Global()
@Module({ providers: [OutboxWriter], exports: [OutboxWriter] })
export class EventsModule {}
