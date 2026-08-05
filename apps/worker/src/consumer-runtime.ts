import { createHash } from "node:crypto";
import { sanitizeDeliveryError } from "./delivery-error.js";
import {
  ConsumerRepository,
  type ClaimedConsumerDelivery,
} from "./consumer-repository.js";
import { nextAttemptAt, retryDelaySeconds } from "./retry.js";

export interface ConsumerHandlerResult {
  readonly handlerVersion: string;
  readonly evidence: Readonly<Record<string, unknown>>;
}

export interface ConsumerHandler {
  handle(delivery: ClaimedConsumerDelivery): Promise<ConsumerHandlerResult>;
}

function checksum(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

class DeliveryEvidenceHandler implements ConsumerHandler {
  async handle(delivery: ClaimedConsumerDelivery): Promise<ConsumerHandlerResult> {
    const envelope = delivery.envelope;
    if (envelope.eventId !== delivery.outboxEventId) {
      throw new Error("event-envelope-id-mismatch");
    }
    if (envelope.eventName !== delivery.eventName) {
      throw new Error("event-envelope-name-mismatch");
    }
    if (envelope.tenantId !== delivery.tenantId) {
      throw new Error("event-envelope-tenant-mismatch");
    }
    return {
      handlerVersion: "platform.delivery-evidence.v1",
      evidence: {
        eventId: delivery.outboxEventId,
        consumerKey: delivery.consumerKey,
        replaySequence: delivery.replaySequence,
        observedAt: new Date().toISOString(),
      },
    };
  }
}

export class ConsumerRuntime {
  private readonly handlers = new Map<string, ConsumerHandler>();

  constructor(
    private readonly repository: ConsumerRepository,
    private readonly workerId: string,
    private readonly batchSize: number,
    private readonly retryBaseSeconds: number,
    private readonly retryMaximumSeconds: number,
  ) {
    this.handlers.set("platform.delivery-evidence", new DeliveryEvidenceHandler());
  }

  register(handlerKey: string, handler: ConsumerHandler): void {
    if (this.handlers.has(handlerKey)) {
      throw new Error(`Consumer handler ${handlerKey} is already registered`);
    }
    this.handlers.set(handlerKey, handler);
  }

  async processDue(): Promise<{
    readonly claimed: number;
    readonly completed: number;
    readonly failed: number;
  }> {
    const deliveries = await this.repository.claim(this.workerId, this.batchSize);
    let completed = 0;
    let failed = 0;
    for (const delivery of deliveries) {
      const startedAt = Date.now();
      const handler = this.handlers.get(delivery.handlerKey);
      try {
        if (!handler) throw new Error(`consumer-handler-unavailable:${delivery.handlerKey}`);
        const result = await handler.handle(delivery);
        const acknowledged = await this.repository.complete(
          this.workerId,
          delivery,
          result.handlerVersion,
          checksum(result.evidence),
          Date.now() - startedAt,
        );
        if (!acknowledged) throw new Error("consumer-lease-lost");
        completed += 1;
      } catch (error) {
        const message = sanitizeDeliveryError(error);
        const deadLetter = delivery.attempts >= delivery.maximumAttempts;
        const delaySeconds = retryDelaySeconds(
          delivery.id,
          delivery.attempts,
          this.retryBaseSeconds,
          this.retryMaximumSeconds,
        );
        await this.repository.fail(
          this.workerId,
          delivery,
          message,
          nextAttemptAt(new Date(), delaySeconds),
          deadLetter,
          Date.now() - startedAt,
        );
        failed += 1;
      }
    }
    return { claimed: deliveries.length, completed, failed };
  }
}
