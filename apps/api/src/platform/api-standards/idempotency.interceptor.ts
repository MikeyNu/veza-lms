import { createHash } from "node:crypto";
import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  SetMetadata,
  type NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { TenantId, UserId } from "@veza/contracts";
import type { FastifyRequest } from "fastify";
import type { QueryResultRow } from "pg";
import { from, mergeMap, of, type Observable } from "rxjs";
import { CacheService, type IdempotencyReservation } from "../cache/cache.service.js";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";

const requireIdempotencyKey = "veza:api:require-idempotency";
export const RequireIdempotency = () => SetMetadata(requireIdempotencyKey, true);

interface IdempotentRequest extends FastifyRequest {
  readonly body?: unknown;
}

interface IdempotencyRow extends QueryResultRow {
  readonly request_hash: string;
  readonly state: "processing" | "completed";
  readonly response_body: Readonly<Record<string, unknown>> | null;
}

function hashRequest(request: IdempotentRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        method: request.method,
        path: request.routeOptions?.url ?? request.url.split("?")[0] ?? request.url,
        query: request.query ?? {},
        body: request.body ?? null,
      }),
      "utf8",
    )
    .digest("hex");
}

function operationKey(request: IdempotentRequest): string {
  return `${request.method}:${request.routeOptions?.url ?? request.url.split("?")[0] ?? request.url}`;
}

function responseEnvelope(value: unknown): Readonly<Record<string, unknown>> {
  return { value };
}

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly cache: CacheService,
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly reflector: Reflector,
  ) {}

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = execution.switchToHttp().getRequest<IdempotentRequest>();
    if (!["POST", "PUT", "PATCH", "DELETE"].includes(request.method)) return next.handle();
    const required = this.reflector.getAllAndOverride<boolean>(requireIdempotencyKey, [
      execution.getHandler(),
      execution.getClass(),
    ]);
    const key = request.headers["idempotency-key"]?.toString().trim();
    if (!key) {
      if (required) throw new BadRequestException("Idempotency-Key is required for this operation");
      return next.handle();
    }
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
      throw new BadRequestException("Idempotency-Key must be 16-128 URL-safe characters");
    }
    const active = this.context.optional();
    if (!active) return next.handle();
    const operation = operationKey(request);
    const requestHash = hashRequest(request);
    return from(this.reserve(active.tenantId, active.actorId, operation, key, requestHash)).pipe(
      mergeMap((reservation) => {
        if (reservation.state === "completed") return of(reservation.response?.value);
        if (reservation.state === "processing") {
          throw new ConflictException("An identical operation is already being processed");
        }
        return next.handle().pipe(
          mergeMap((value) =>
            from(
              this.complete(
                active.tenantId,
                operation,
                key,
                requestHash,
                reservation.token,
                value,
              ),
            ).pipe(mergeMap(() => of(value))),
          ),
        );
      }),
    );
  }

  private async reserve(
    tenantId: TenantId,
    actorId: UserId,
    operation: string,
    key: string,
    requestHash: string,
  ): Promise<IdempotencyReservation> {
    const cache = await this.cache.reserveIdempotency(operation, key, requestHash);
    if (cache.state === "completed" || cache.state === "processing") return cache;
    const expiresAt = new Date(Date.now() + 86_400_000);
    const durable: IdempotencyReservation = await this.database.withTenantTransaction(
      tenantId,
      async (client): Promise<IdempotencyReservation> => {
        const inserted = await client.query(
          `INSERT INTO api_idempotency_records (
             tenant_id, idempotency_key, operation_key, request_hash,
             actor_id, state, expires_at
           ) VALUES ($1,$2,$3,$4,$5,'processing',$6)
           ON CONFLICT (tenant_id, operation_key, idempotency_key) DO NOTHING
           RETURNING id`,
          [tenantId, key, operation, requestHash, actorId, expiresAt],
        );
        if (inserted.rowCount) return { state: "reserved" };
        const existing = await client.query<IdempotencyRow>(
          `SELECT request_hash, state, response_body
           FROM api_idempotency_records
           WHERE operation_key = $1 AND idempotency_key = $2
           FOR UPDATE`,
          [operation, key],
        );
        const row = existing.rows[0];
        if (!row || row.request_hash !== requestHash) {
          throw new ConflictException("Idempotency key was used with a different request");
        }
        if (row.state === "completed") {
          return {
            state: "completed",
            ...(row.response_body ? { response: row.response_body } : {}),
          };
        }
        return { state: "processing" };
      },
    );
    if (durable.state !== "reserved") return durable;
    return cache;
  }

  private async complete(
    tenantId: TenantId,
    operation: string,
    key: string,
    requestHash: string,
    token: string | undefined,
    value: unknown,
  ): Promise<void> {
    const response = responseEnvelope(value);
    await this.database.withTenantTransaction(tenantId, (client) =>
      client.query(
        `UPDATE api_idempotency_records
         SET state = 'completed', response_status = 200,
             response_headers = '{"content-type":"application/json"}'::jsonb,
             response_body = $4, updated_at = now()
         WHERE operation_key = $1 AND idempotency_key = $2
           AND request_hash = $3 AND state = 'processing'`,
        [operation, key, requestHash, response],
      ),
    );
    if (token) {
      await this.cache.completeIdempotency(operation, key, token, requestHash, response);
    }
  }
}
