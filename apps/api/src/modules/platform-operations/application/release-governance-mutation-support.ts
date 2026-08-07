import { createHash } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import type { PoolClient, QueryResultRow } from "pg";
import { DatabaseService } from "../../../platform/database/database.service.js";

interface OperationRequestRow<TResponse> extends QueryResultRow {
  readonly operation_type: string;
  readonly request_hash: string;
  readonly status: "processing" | "completed" | "failed";
  readonly resource_type: string;
  readonly resource_id: string;
  readonly response: TResponse | null;
}

const credentialPattern = /\b(?:authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|secret)\b\s*[:=]|\bBearer\s+/i;
const flagPattern = /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/;
const ringPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function operationalReason(value: string): string {
  const reason = value.trim().replace(/\s+/g, " ");
  if (credentialPattern.test(reason)) {
    throw new BadRequestException("Operational reason must not contain credentials or bearer tokens");
  }
  return reason;
}

export function canonicalHash(value: object): string {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

export function requireVersion(expected: number, actual: number, resource: string): void {
  if (expected !== actual) {
    throw new ConflictException(`${resource} changed since it was loaded; refresh before retrying`);
  }
}

export function featureFlagKey(value: string): string {
  const key = value.trim().toLowerCase();
  if (!flagPattern.test(key)) throw new BadRequestException("Feature flag key is invalid");
  return key;
}

export function releaseRingKey(value: string): string {
  const key = value.trim().toLowerCase();
  if (!ringPattern.test(key)) throw new BadRequestException("Release ring key is invalid");
  return key;
}

@Injectable()
export class PlatformOperationExecutor {
  constructor(private readonly database: DatabaseService) {}

  async run<TResponse extends object>(
    principal: AuthenticatedPrincipal,
    idempotencyKey: string,
    operationType: string,
    resourceType: string,
    resourceId: string,
    hash: string,
    action: (client: PoolClient) => Promise<TResponse>,
  ): Promise<TResponse> {
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Idempotency-Key must be 16-128 URL-safe characters");
    }
    return this.database.withControlPlaneTransaction(async (client) => {
      const inserted = await client.query(
        `INSERT INTO platform_operation_requests (
           idempotency_key, operation_type, actor_id, request_hash,
           status, resource_type, resource_id
         ) VALUES ($1,$2,$3,$4,'processing',$5,$6)
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, operationType, principal.userId, hash, resourceType, resourceId],
      );
      if (inserted.rowCount === 0) {
        const existingResult = await client.query<OperationRequestRow<TResponse>>(
          `SELECT operation_type, request_hash, status, resource_type, resource_id, response
           FROM platform_operation_requests
           WHERE idempotency_key = $1 FOR UPDATE`,
          [idempotencyKey],
        );
        const existing = existingResult.rows[0];
        if (!existing
          || existing.operation_type !== operationType
          || existing.resource_type !== resourceType
          || existing.resource_id !== resourceId
          || existing.request_hash !== hash) {
          throw new ConflictException("Idempotency-Key was already used for another platform operation");
        }
        if (existing.status === "completed" && existing.response) return existing.response;
        throw new ConflictException("The platform operation is already in progress");
      }
      const response = await action(client);
      await client.query(
        `UPDATE platform_operation_requests
         SET status = 'completed', response = $2, updated_at = now()
         WHERE idempotency_key = $1`,
        [idempotencyKey, response],
      );
      return response;
    });
  }
}
