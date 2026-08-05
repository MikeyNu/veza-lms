import { Injectable } from "@nestjs/common";

interface OperationDefinition {
  readonly method: "get" | "post";
  readonly path: string;
  readonly operationId: string;
  readonly summary: string;
  readonly tag: string;
  readonly boundary: "public" | "tenant" | "internal" | "control-plane";
  readonly security?: readonly Readonly<Record<string, readonly string[]>>[];
  readonly idempotency?: "optional" | "required";
  readonly mfa?: boolean;
}

const bearer = [{ bearerAuth: [] }] as const;
const service = [{ oauth2ClientCredentials: [] }] as const;

const operations: readonly OperationDefinition[] = [
  { method: "get", path: "/v1/health/live", operationId: "getLiveness", summary: "Process liveness", tag: "Health", boundary: "public" },
  { method: "get", path: "/v1/health/ready", operationId: "getReadiness", summary: "Dependency readiness", tag: "Health", boundary: "public" },
  { method: "post", path: "/v1/oauth/token", operationId: "issueClientCredentialsToken", summary: "Issue a service access token", tag: "Authentication", boundary: "public" },
  { method: "get", path: "/v1/public/certificates/{verificationCode}", operationId: "verifyCertificate", summary: "Verify a credential", tag: "Credentials", boundary: "public" },
  { method: "get", path: "/v1/search", operationId: "searchWorkspace", summary: "Search permitted tenant content", tag: "Search", boundary: "tenant", security: bearer },
  { method: "get", path: "/v1/communications/workspace", operationId: "getCommunicationsWorkspace", summary: "Read communications evidence", tag: "Communications", boundary: "tenant", security: bearer },
  { method: "post", path: "/v1/communications/intents", operationId: "queueNotification", summary: "Queue a notification intent", tag: "Communications", boundary: "tenant", security: [...bearer, ...service], idempotency: "required" },
  { method: "post", path: "/v1/storage/uploads", operationId: "createMediaUpload", summary: "Create a governed media upload", tag: "Media", boundary: "tenant", security: [...bearer, ...service], idempotency: "required" },
  { method: "post", path: "/v1/storage/upload-sessions/{sessionId}/complete", operationId: "completeMediaUpload", summary: "Register completed upload evidence", tag: "Media", boundary: "tenant", security: [...bearer, ...service], idempotency: "required" },
  { method: "get", path: "/v1/storage/assets/{assetId}/delivery", operationId: "createMediaDeliveryUrl", summary: "Create a signed media delivery URL", tag: "Media", boundary: "tenant", security: [...bearer, ...service] },
  { method: "post", path: "/v1/service-accounts", operationId: "createServiceAccount", summary: "Create a service account", tag: "Service accounts", boundary: "tenant", security: bearer, mfa: true },
  { method: "get", path: "/v1/control-plane/events/overview", operationId: "getEventPlatformOverview", summary: "Read event delivery reconciliation", tag: "Event platform", boundary: "control-plane", security: bearer },
  { method: "post", path: "/v1/control-plane/events/{eventId}/replay", operationId: "replayEvent", summary: "Replay an event for one or more consumers", tag: "Event platform", boundary: "control-plane", security: bearer, idempotency: "required", mfa: true },
  { method: "post", path: "/v1/internal/communications/providers/events", operationId: "recordNotificationProviderEvent", summary: "Record signed provider feedback", tag: "Internal webhooks", boundary: "internal" },
];

function responseSchema() {
  return {
    description: "Successful response",
    content: { "application/json": { schema: { type: "object", additionalProperties: true } } },
  };
}

function operation(operation: OperationDefinition) {
  return {
    operationId: operation.operationId,
    summary: operation.summary,
    tags: [operation.tag],
    "x-veza-boundary": operation.boundary,
    ...(operation.idempotency
      ? {
          "x-veza-idempotency": operation.idempotency,
          parameters: [
            {
              name: "Idempotency-Key",
              in: "header",
              required: operation.idempotency === "required",
              schema: { type: "string", minLength: 16, maxLength: 128 },
            },
          ],
        }
      : {}),
    ...(operation.mfa ? { "x-veza-requires-mfa": true } : {}),
    ...(operation.security ? { security: operation.security } : {}),
    responses: {
      "200": responseSchema(),
      "400": { $ref: "#/components/responses/Problem" },
      "401": { $ref: "#/components/responses/Problem" },
      "403": { $ref: "#/components/responses/Problem" },
      "409": { $ref: "#/components/responses/Problem" },
      "429": { $ref: "#/components/responses/Problem" },
      "500": { $ref: "#/components/responses/Problem" },
    },
  };
}

@Injectable()
export class OpenApiService {
  document(boundary: "public" | "internal" = "public") {
    const visible = operations.filter((item) =>
      boundary === "internal" ? true : item.boundary !== "internal" && item.boundary !== "control-plane",
    );
    const paths: Record<string, Record<string, unknown>> = {};
    for (const item of visible) {
      paths[item.path] ??= {};
      paths[item.path][item.method] = operation(item);
    }
    return {
      openapi: "3.1.0",
      info: {
        title: boundary === "internal" ? "Veza Internal Platform API" : "Veza Learning Cloud API",
        version: "1.0.0",
        description:
          "Tenant-safe Veza APIs. Error responses use RFC 9457 style problem details. Collection endpoints use opaque cursor pagination. Mutations use Idempotency-Key and optimistic version preconditions where documented.",
        license: { name: "Proprietary" },
      },
      jsonSchemaDialect: "https://json-schema.org/draft/2020-12/schema",
      servers: [{ url: process.env.VEZA_PUBLIC_API_URL ?? "http://localhost:4000" }],
      tags: [...new Set(visible.map((item) => item.tag))].map((name) => ({ name })),
      paths,
      components: {
        securitySchemes: {
          bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
          oauth2ClientCredentials: {
            type: "oauth2",
            flows: {
              clientCredentials: {
                tokenUrl: "/v1/oauth/token",
                scopes: {
                  "communications:write": "Queue governed notification intents",
                  "storage:write": "Create and complete media uploads",
                  "storage:read": "Create signed media delivery URLs",
                  "search:read": "Search permitted tenant resources",
                },
              },
            },
          },
          providerWebhook: {
            type: "apiKey",
            in: "header",
            name: "X-Veza-Signature",
            description: "HMAC-SHA256 over timestamp and exact request body. X-Veza-Timestamp must be within five minutes.",
          },
        },
        schemas: {
          Problem: {
            type: "object",
            required: ["type", "title", "status", "code", "detail", "correlationId", "timestamp"],
            properties: {
              type: { type: "string", format: "uri" },
              title: { type: "string" },
              status: { type: "integer" },
              code: { type: "string" },
              detail: { type: "string" },
              instance: { type: "string" },
              correlationId: { type: "string" },
              timestamp: { type: "string", format: "date-time" },
              errors: { type: "array", items: { type: "string" } },
            },
          },
          CursorPage: {
            type: "object",
            required: ["items"],
            properties: {
              items: { type: "array", items: {} },
              nextCursor: { type: "string" },
            },
          },
          OptimisticVersion: {
            type: "object",
            required: ["expectedVersion"],
            properties: { expectedVersion: { type: "integer", minimum: 1 } },
          },
        },
        responses: {
          Problem: {
            description: "Standard Veza API problem response",
            content: { "application/problem+json": { schema: { $ref: "#/components/schemas/Problem" } } },
          },
        },
      },
      "x-veza-api-policy": {
        cursorPagination: "Opaque base64url cursors. Clients must not inspect cursor contents.",
        idempotency: "Unsafe retryable operations use Idempotency-Key for 24 hours.",
        optimisticConcurrency: "Mutable resources use expectedVersion or If-Match preconditions.",
        deprecation: "Responses include Deprecation, Sunset and Link headers before removal.",
        webhookReplayProtection: "Signed timestamp, nonce and payload checksum are verified before processing.",
      },
    };
  }
}
