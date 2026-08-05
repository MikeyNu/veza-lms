import {
  CallHandler,
  ExecutionContext,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { catchError, finalize, throwError, type Observable } from "rxjs";
import { TenantContext } from "../request-context/tenant-context.js";
import { ObservabilityService } from "./observability.service.js";

interface ObservableRequest extends FastifyRequest {
  correlationId?: string;
  traceId?: string;
  spanId?: string;
  readonly principal?: { readonly userId: string };
}

@Injectable()
export class ObservabilityInterceptor implements NestInterceptor {
  constructor(
    private readonly observability: ObservabilityService,
    private readonly context: TenantContext,
  ) {}

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = execution.switchToHttp();
    const request = http.getRequest<ObservableRequest>();
    const reply = http.getResponse<FastifyReply>();
    const startedAt = Date.now();
    const trace = this.observability.createTrace(request.headers.traceparent?.toString());
    const correlationId =
      request.headers["x-correlation-id"]?.toString().slice(0, 160) ||
      request.id ||
      trace.traceId;
    request.correlationId = correlationId;
    request.traceId = trace.traceId;
    request.spanId = trace.spanId;
    reply.header("x-correlation-id", correlationId);
    reply.header("traceparent", trace.traceparent);
    let observedError: unknown;

    return next.handle().pipe(
      catchError((error) => {
        observedError = error;
        return throwError(() => error);
      }),
      finalize(() => {
        const endedAt = Date.now();
        const route = request.routeOptions?.url ?? request.url.split("?")[0];
        let tenantId: string | undefined;
        let actorId = request.principal?.userId;
        try {
          const active = this.context.require();
          tenantId = active.tenantId;
          actorId ??= active.actorId;
        } catch {
          tenantId = undefined;
        }
        const statusCode = reply.statusCode || (observedError ? 500 : 200);
        const errorCode = observedError && typeof observedError === "object"
          ? String((observedError as { code?: string }).code ?? "request.failed")
          : undefined;
        const requestBytes = Number(request.headers["content-length"] ?? 0) || 0;
        const responseBytes = Number(reply.getHeader("content-length") ?? 0) || 0;
        void this.observability.recordRequest({
          tenantId,
          actorId,
          route,
          method: request.method,
          statusCode,
          latencyMs: endedAt - startedAt,
          requestBytes,
          responseBytes,
          correlationId,
          traceId: trace.traceId,
          errorCode,
        });
        if (observedError) {
          void this.observability.reportError(observedError, {
            tenantId,
            route,
            correlationId,
            traceId: trace.traceId,
          });
          const databaseCode = typeof observedError === "object"
            ? (observedError as { code?: string }).code
            : undefined;
          if (statusCode === 401) {
            void this.observability.recordSecurity("authentication-failure", {
              tenantId,
              actorId,
              route,
              reasonCode: errorCode ?? "authentication.required",
              source: request.ip,
              correlationId,
            });
          } else if (databaseCode === "42501") {
            void this.observability.recordSecurity("rls-denial", {
              tenantId,
              actorId,
              route,
              reasonCode: "postgresql.rls-denial",
              source: request.ip,
              correlationId,
            });
          } else if (statusCode === 403) {
            void this.observability.recordSecurity("authorization-denial", {
              tenantId,
              actorId,
              route,
              reasonCode: errorCode ?? "authorization.denied",
              source: request.ip,
              correlationId,
            });
          } else if (statusCode === 429) {
            void this.observability.recordSecurity("quota-denial", {
              tenantId,
              actorId,
              route,
              reasonCode: "quota.exceeded",
              source: request.ip,
              correlationId,
            });
          }
        }
        void this.observability.exportSpan({
          traceId: trace.traceId,
          spanId: trace.spanId,
          parentSpanId: trace.parentSpanId,
          name: `${request.method} ${route}`,
          startedAt,
          endedAt,
          statusCode,
          attributes: {
            "http.request.method": request.method,
            "http.route": route,
            "http.response.status_code": statusCode,
            "server.address": request.hostname,
            ...(tenantId ? { "veza.tenant_id": tenantId } : {}),
          },
        });
      }),
    );
  }
}
