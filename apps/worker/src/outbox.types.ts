export interface ClaimedOutboxEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly eventName: string;
  readonly eventVersion: number;
  readonly aggregateType: string;
  readonly aggregateId: string;
  readonly aggregateVersion: number;
  readonly actorId: string;
  readonly correlationId: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
  readonly attempts: number;
}

export interface PublishResult {
  readonly eventId: string;
  readonly success: boolean;
  readonly reference?: string;
  readonly error?: string;
}

export interface EventPublisher {
  publish(events: readonly ClaimedOutboxEvent[]): Promise<readonly PublishResult[]>;
}
