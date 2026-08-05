import {
  EventBridgeClient,
  PutEventsCommand,
  type PutEventsCommandOutput,
  type PutEventsRequestEntry,
} from "@aws-sdk/client-eventbridge";
import { sanitizeDeliveryError } from "./delivery-error.js";
import type { ClaimedOutboxEvent, EventPublisher, PublishResult } from "./outbox.types.js";

const maximumEntryBytes = 240 * 1024;
const maximumEntries = 10;

interface EventBridgeClientLike {
  send(command: PutEventsCommand, options?: { readonly abortSignal?: AbortSignal }): Promise<PutEventsCommandOutput>;
}

function detail(event: ClaimedOutboxEvent): string {
  return JSON.stringify({
    schemaVersion: 1,
    eventId: event.id,
    tenantId: event.tenantId,
    eventName: event.eventName,
    eventVersion: event.eventVersion,
    aggregate: {
      type: event.aggregateType,
      id: event.aggregateId,
      version: event.aggregateVersion,
    },
    actorId: event.actorId,
    correlationId: event.correlationId,
    occurredAt: event.occurredAt,
    payload: event.payload,
  });
}

function entrySize(entry: PutEventsRequestEntry): number {
  return Buffer.byteLength(entry.Source ?? "", "utf8")
    + Buffer.byteLength(entry.DetailType ?? "", "utf8")
    + Buffer.byteLength(entry.Detail ?? "", "utf8")
    + (entry.Resources ?? []).reduce((total, resource) => total + Buffer.byteLength(resource, "utf8"), 0)
    + 14;
}

interface PreparedEvent {
  readonly event: ClaimedOutboxEvent;
  readonly entry: PutEventsRequestEntry;
  readonly size: number;
}

function prepare(event: ClaimedOutboxEvent, eventBusName: string, source: string): PreparedEvent {
  const entry: PutEventsRequestEntry = {
    EventBusName: eventBusName,
    Source: source,
    DetailType: event.eventName.slice(0, 128),
    Detail: detail(event),
    Time: new Date(event.occurredAt),
  };
  return { event, entry, size: entrySize(entry) };
}

function batches(events: readonly PreparedEvent[]): readonly (readonly PreparedEvent[])[] {
  const groups: PreparedEvent[][] = [];
  for (let index = 0; index < events.length; index += maximumEntries) {
    groups.push(events.slice(index, index + maximumEntries));
  }
  return groups;
}

export class EventBridgePublisher implements EventPublisher {
  private readonly client: EventBridgeClientLike;

  constructor(
    private readonly eventBusName: string,
    private readonly source: string,
    private readonly requestTimeoutMs: number,
    region: string,
    client?: EventBridgeClientLike,
  ) {
    this.client = client ?? new EventBridgeClient({ region });
  }

  async publish(events: readonly ClaimedOutboxEvent[]): Promise<readonly PublishResult[]> {
    const prepared = events.map((event) => prepare(event, this.eventBusName, this.source));
    const oversized = prepared.filter((item) => item.size > maximumEntryBytes);
    const deliverable = prepared.filter((item) => item.size <= maximumEntryBytes);
    const results: PublishResult[] = oversized.map((item) => ({
      eventId: item.event.id,
      success: false,
      error: "Event exceeds the configured EventBridge entry-size safety limit",
    }));

    for (const group of batches(deliverable)) {
      try {
        const response = await this.client.send(
          new PutEventsCommand({ Entries: group.map((item) => item.entry) }),
          { abortSignal: AbortSignal.timeout(this.requestTimeoutMs) },
        );
        const entries = response.Entries ?? [];
        group.forEach((item, index) => {
          const result = entries[index];
          if (result?.ErrorCode) {
            results.push({
              eventId: item.event.id,
              success: false,
              error: sanitizeDeliveryError(`${result.ErrorCode}: ${result.ErrorMessage ?? "EventBridge rejected the event"}`),
            });
          } else if (result?.EventId) {
            results.push({ eventId: item.event.id, success: true, reference: result.EventId });
          } else {
            results.push({ eventId: item.event.id, success: false, error: "EventBridge returned no result for the event" });
          }
        });
      } catch (error) {
        const message = sanitizeDeliveryError(error);
        group.forEach((item) => results.push({ eventId: item.event.id, success: false, error: message }));
      }
    }
    return results;
  }
}

export class StdoutPublisher implements EventPublisher {
  async publish(events: readonly ClaimedOutboxEvent[]): Promise<readonly PublishResult[]> {
    return events.map((event) => {
      process.stdout.write(`${JSON.stringify({
        level: "info",
        message: "Outbox event delivered to local stdout transport",
        eventId: event.id,
        tenantId: event.tenantId,
        eventName: event.eventName,
        aggregateType: event.aggregateType,
        aggregateId: event.aggregateId,
        correlationId: event.correlationId,
      })}\n`);
      return { eventId: event.id, success: true, reference: `stdout:${event.id}` };
    });
  }
}
