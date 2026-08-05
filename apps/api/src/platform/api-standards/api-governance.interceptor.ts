import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  type NestInterceptor,
} from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { from, mergeMap, tap, type Observable } from "rxjs";
import { CacheService, type RateLimitDecision } from "../cache/cache.service.js";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";

interface GovernanceRequest extends FastifyRequest {
  readonly principal?: { readonly userId: string };
}

interface QuotaPolicy {
  readonly requestLimit: number;
  readonly windowSeconds: number;
  readonly policyId: string;
}

function route(request: GovernanceRequest): string {
  return request.routeOptions?.url ?? request.url.split("?")[0];
}

function method(request: GovernanceRequest): string {
  return request.method.toUpperCase();
}

function wildcardMatches(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replaceAll("*", ".*");
  return new RegExp(`^${escaped}$`).test(value);
}

@Injectable()
export class ApiGovernanceInterceptor implements NestInterceptor {
  constructor(
    private readonly cache: CacheService,
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = execution.switchToHttp();
    const request = http.getRequest<GovernanceRequest>();
    const reply = http.getResponse<FastifyReply>();
    let active: ReturnType<TenantContext["require"]>;
    try {
      active = this.context.require();
    } catch {
      return next.handle();
    }
    return from(this.govern(request, reply, active.tenantId, request.principal?.userId)).pipe(
      mergeMap((decision) =>
        next.handle().pipe(
          tap(() => {
            reply.header("x-ratelimit-limit", decision.limit);
            reply.header("x-ratelimit-remaining", decision.remaining);
            reply.header("x-ratelimit-reset", decision.resetAt);
          }),
        ),
      ),
    );
  }

  private async govern(
    request: GovernanceRequest,
    reply: FastifyReply,
    tenantId: string,
    userId: string | undefined,
  ): Promise<RateLimitDecision> {
    const routeKey = route(request);
    const methodKey = method(request);
    const subjectId = userId ?? tenantId;
    const cacheKey = `${methodKey}:${routeKey}:${subjectId}`.replace(/[^A-Za-z0-9._:-]+/g, "-").slice(0, 160);
    const policy = await this.cache.rememberJson(
      "api-quota-policy",
      cacheKey,
      60,
      async () => this.loadPolicy(tenantId, routeKey, methodKey, userId),
    ) as unknown as QuotaPolicy;
    const decision = await this.cache.rateLimit(
      `api:${policy.policyId}:${subjectId}`,
      policy.requestLimit,
      policy.windowSeconds,
    );
    if (!decision.allowed) {
      reply.header("retry-after", decision.retryAfterSeconds ?? policy.windowSeconds);
      reply.header("x-ratelimit-limit", decision.limit);
      reply.header("x-ratelimit-remaining", decision.remaining);
      reply.header("x-ratelimit-reset", decision.resetAt);
      throw new HttpException("API quota has been exceeded", 429);
    }
    await this.applyDeprecation(reply, routeKey, methodKey);
    return decision;
  }

  private async loadPolicy(
    tenantId: string,
    routeKey: string,
    methodKey: string,
    userId: string | undefined,
  ): Promise<QuotaPolicy & Readonly<Record<string, unknown>>> {
    const result = await this.database.withTenantTransaction(tenantId, (client) =>
      client.query(
        `SELECT id, subject_type, subject_id, route_pattern,
                request_limit, window_seconds
         FROM api_quota_policies
         WHERE status = 'active'
           AND method IN ('*',$1)
           AND (
             subject_type = 'tenant' OR
             (subject_type = 'user' AND subject_id = $2::uuid)
           )
         ORDER BY
           CASE WHEN subject_type = 'user' THEN 0 ELSE 1 END,
           length(route_pattern) DESC`,
        [methodKey, userId ?? null],
      ),
    );
    const row = result.rows.find((candidate) => wildcardMatches(candidate.route_pattern, routeKey));
    return row
      ? {
          policyId: row.id,
          requestLimit: Number(row.request_limit),
          windowSeconds: Number(row.window_seconds),
        }
      : {
          policyId: "default",
          requestLimit: Number(process.env.API_DEFAULT_RATE_LIMIT ?? 600),
          windowSeconds: Number(process.env.API_DEFAULT_RATE_WINDOW_SECONDS ?? 60),
        };
  }

  private async applyDeprecation(
    reply: FastifyReply,
    routeKey: string,
    methodKey: string,
  ): Promise<void> {
    const result = await this.database.controlPlaneQuery(
      `SELECT route_pattern, deprecated_at, sunset_at,
              successor_url, documentation_url
       FROM api_deprecation_registry
       WHERE status = 'active' AND method IN ('*',$1)
       ORDER BY length(route_pattern) DESC`,
      [methodKey],
    );
    const row = result.rows.find((candidate) => wildcardMatches(candidate.route_pattern, routeKey));
    if (!row) return;
    reply.header("deprecation", new Date(row.deprecated_at).toUTCString());
    if (row.sunset_at) reply.header("sunset", new Date(row.sunset_at).toUTCString());
    const links = [
      `<${row.documentation_url}>; rel="deprecation"`,
      ...(row.successor_url ? [`<${row.successor_url}>; rel="successor-version"`] : []),
    ];
    reply.header("link", links.join(", "));
  }
}
