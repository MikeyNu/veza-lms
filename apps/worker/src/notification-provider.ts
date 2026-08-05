import { sanitizeDeliveryError } from "./delivery-error.js";

export type NotificationChannel = "email" | "sms" | "push";

export interface NotificationMessage {
  readonly deliveryId: string;
  readonly tenantId: string;
  readonly channel: NotificationChannel;
  readonly sender: Readonly<Record<string, unknown>>;
  readonly recipient: Readonly<Record<string, unknown>>;
  readonly content: Readonly<Record<string, unknown>>;
  readonly correlationId: string;
}

export interface NotificationProviderResult {
  readonly accepted: boolean;
  readonly providerMessageId?: string;
  readonly providerStatus?: string;
  readonly errorCode?: string;
}

export interface NotificationProvider {
  send(message: NotificationMessage): Promise<NotificationProviderResult>;
}

class StdoutNotificationProvider implements NotificationProvider {
  async send(message: NotificationMessage): Promise<NotificationProviderResult> {
    process.stdout.write(
      `${JSON.stringify({
        level: "info",
        message: "Local notification accepted",
        timestamp: new Date().toISOString(),
        service: "veza-worker",
        deliveryId: message.deliveryId,
        tenantId: message.tenantId,
        channel: message.channel,
        recipientKeys: Object.keys(message.recipient),
      })}\n`,
    );
    return {
      accepted: true,
      providerMessageId: `local-${message.deliveryId}`,
      providerStatus: "accepted",
    };
  }
}

class HttpNotificationProvider implements NotificationProvider {
  constructor(
    private readonly endpoint: string,
    private readonly token: string | undefined,
    private readonly timeoutMs: number,
  ) {}

  async send(message: NotificationMessage): Promise<NotificationProviderResult> {
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          ...(this.token ? { authorization: `Bearer ${this.token}` } : {}),
          "x-veza-delivery-id": message.deliveryId,
          "x-veza-tenant-id": message.tenantId,
          "x-veza-correlation-id": message.correlationId,
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        return {
          accepted: false,
          errorCode: `provider-http-${response.status}`,
          providerStatus: typeof body.status === "string" ? body.status : undefined,
        };
      }
      return {
        accepted: true,
        providerMessageId:
          typeof body.messageId === "string"
            ? body.messageId
            : response.headers.get("x-provider-message-id") ?? undefined,
        providerStatus: typeof body.status === "string" ? body.status : "accepted",
      };
    } catch (error) {
      return { accepted: false, errorCode: sanitizeDeliveryError(error) };
    }
  }
}

export class NotificationProviderRegistry {
  private readonly providers = new Map<string, NotificationProvider>();

  constructor() {
    const timeoutMs = Number(process.env.NOTIFICATION_PROVIDER_TIMEOUT_MS ?? 15_000);
    this.providers.set("stdout", new StdoutNotificationProvider());
    for (const channel of ["EMAIL", "SMS", "PUSH"] as const) {
      const endpoint = process.env[`${channel}_PROVIDER_URL`]?.trim();
      const token = process.env[`${channel}_PROVIDER_TOKEN`]?.trim();
      if (endpoint) {
        this.providers.set(
          `http-${channel.toLowerCase()}`,
          new HttpNotificationProvider(endpoint, token, timeoutMs),
        );
      }
    }
  }

  resolve(providerKey: string): NotificationProvider {
    if (process.env.NODE_ENV === "production" && providerKey === "stdout") {
      throw new Error("notification-local-provider-prohibited");
    }
    const provider = this.providers.get(providerKey);
    if (provider) return provider;
    if (process.env.NODE_ENV !== "production") return this.providers.get("stdout")!;
    throw new Error(`notification-provider-unavailable:${providerKey}`);
  }
}
