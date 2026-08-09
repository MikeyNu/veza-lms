import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  ServiceUnavailableException,
} from "@nestjs/common";
import { TenantContext } from "../request-context/tenant-context.js";
import { RedisRespClient, type RedisValue } from "./redis-resp-client.js";

const segmentPattern = /^[A-Za-z0-9._:-]{1,160}$/;

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: string;
  readonly retryAfterSeconds?: number;
}

export interface DistributedLock {
  readonly key: string;
  readonly token: string;
  readonly expiresAt: string;
}

export interface IdempotencyReservation {
  readonly state: "reserved" | "processing" | "completed";
  readonly token?: string;
  readonly response?: Readonly<Record<string, unknown>>;
}

function asNumber(value: RedisValue, label: string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new ServiceUnavailableException(`Redis ${label} response is invalid`);
  return parsed;
}

function asString(value: RedisValue, label: string): string {
  if (typeof value !== "string") throw new ServiceUnavailableException(`Redis ${label} response is invalid`);
  return value;
}

function safeSegment(value: string, label: string): string {
  if (!segmentPattern.test(value)) throw new Error(`${label} contains unsupported characters`);
  return value;
}

function defaultKeyPrefix(environmentLabel: string | undefined): string {
  const environment = (environmentLabel?.trim() || "local")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return `veza:${environment || "local"}`;
}

function parseObject(value: string | null): Readonly<Record<string, unknown>> | undefined {
  if (!value) return undefined;
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new ServiceUnavailableException("Cached JSON value is invalid");
  }
  return parsed as Readonly<Record<string, unknown>>;
}

@Injectable()
export class CacheService {
  private readonly prefix = safeSegment(
    process.env.REDIS_KEY_PREFIX?.trim() || defaultKeyPrefix(process.env.VEZA_ENVIRONMENT_LABEL),
    "REDIS_KEY_PREFIX",
  );

  constructor(
    private readonly redis: RedisRespClient,
    private readonly context: TenantContext,
  ) {}

  async getJson<T extends Readonly<Record<string, unknown>>>(
    namespace: string,
    key: string,
  ): Promise<T | undefined> {
    const cacheKey = await this.cacheKey(namespace, key);
    try {
      const value = await this.redis.command("GET", cacheKey);
      if (value === null) return undefined;
      return parseObject(asString(value, "GET")) as T | undefined;
    } catch (error) {
      if (process.env.CACHE_FAIL_CLOSED === "true") throw error;
      return undefined;
    }
  }

  async setJson(
    namespace: string,
    key: string,
    value: Readonly<Record<string, unknown>>,
    ttlSeconds: number,
  ): Promise<void> {
    if (!Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 86_400) {
      throw new Error("Cache TTL must be between 1 and 86400 seconds");
    }
    const cacheKey = await this.cacheKey(namespace, key);
    try {
      const result = await this.redis.command(
        "SET",
        cacheKey,
        JSON.stringify(value),
        "EX",
        ttlSeconds,
      );
      if (result !== "OK") throw new ServiceUnavailableException("Redis SET was not acknowledged");
    } catch (error) {
      if (process.env.CACHE_FAIL_CLOSED === "true") throw error;
    }
  }

  async rememberJson<T extends Readonly<Record<string, unknown>>>(
    namespace: string,
    key: string,
    ttlSeconds: number,
    loader: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.getJson<T>(namespace, key);
    if (cached) return cached;
    const loaded = await loader();
    await this.setJson(namespace, key, loaded, ttlSeconds);
    return loaded;
  }

  async invalidateNamespace(namespace: string): Promise<number> {
    const tenantId = this.context.require().tenantId;
    const epochKey = this.namespaceEpochKey(tenantId, namespace);
    const value = await this.redis.command("INCR", epochKey);
    await this.redis.command("EXPIRE", epochKey, 31_536_000);
    return asNumber(value, "namespace epoch");
  }

  async rateLimit(
    subject: string,
    limit: number,
    windowSeconds: number,
    cost = 1,
  ): Promise<RateLimitDecision> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000_000) {
      throw new Error("Rate limit must be between 1 and 1000000");
    }
    if (!Number.isInteger(windowSeconds) || windowSeconds < 1 || windowSeconds > 86_400) {
      throw new Error("Rate-limit window must be between 1 and 86400 seconds");
    }
    if (!Number.isInteger(cost) || cost < 1 || cost > limit) {
      throw new Error("Rate-limit cost is invalid");
    }
    const tenantId = this.context.require().tenantId;
    const key = `${this.prefix}:tenant:${tenantId}:rate:${safeSegment(subject, "Rate-limit subject")}`;
    const script = `
      local current = redis.call('GET', KEYS[1])
      if not current then
        redis.call('SET', KEYS[1], ARGV[1], 'EX', ARGV[2], 'NX')
        return {1, tonumber(ARGV[3]) - tonumber(ARGV[1]), redis.call('TTL', KEYS[1])}
      end
      local nextValue = tonumber(current) + tonumber(ARGV[1])
      local ttl = redis.call('TTL', KEYS[1])
      if nextValue > tonumber(ARGV[3]) then
        return {0, math.max(0, tonumber(ARGV[3]) - tonumber(current)), ttl}
      end
      redis.call('INCRBY', KEYS[1], ARGV[1])
      return {1, tonumber(ARGV[3]) - nextValue, ttl}
    `;
    const raw = await this.redis.command(
      "EVAL",
      script,
      1,
      key,
      cost,
      windowSeconds,
      limit,
    );
    if (!Array.isArray(raw) || raw.length !== 3) {
      throw new ServiceUnavailableException("Redis rate-limit response is invalid");
    }
    const allowed = asNumber(raw[0], "rate limit") === 1;
    const remaining = Math.max(0, asNumber(raw[1], "rate limit remaining"));
    const ttl = Math.max(1, asNumber(raw[2], "rate limit TTL"));
    return {
      allowed,
      limit,
      remaining,
      resetAt: new Date(Date.now() + ttl * 1000).toISOString(),
      ...(allowed ? {} : { retryAfterSeconds: ttl }),
    };
  }

  async acquireLock(
    namespace: string,
    resourceId: string,
    ttlMilliseconds: number,
  ): Promise<DistributedLock | undefined> {
    if (!Number.isInteger(ttlMilliseconds) || ttlMilliseconds < 1_000 || ttlMilliseconds > 300_000) {
      throw new Error("Lock TTL must be between 1000 and 300000 milliseconds");
    }
    const tenantId = this.context.require().tenantId;
    const key = `${this.prefix}:tenant:${tenantId}:lock:${safeSegment(namespace, "Lock namespace")}:${safeSegment(resourceId, "Lock resource")}`;
    const token = randomUUID();
    const result = await this.redis.command("SET", key, token, "NX", "PX", ttlMilliseconds);
    if (result === null) return undefined;
    if (result !== "OK") throw new ServiceUnavailableException("Redis lock was not acknowledged");
    return {
      key,
      token,
      expiresAt: new Date(Date.now() + ttlMilliseconds).toISOString(),
    };
  }

  async releaseLock(lock: DistributedLock): Promise<boolean> {
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `;
    return asNumber(
      await this.redis.command("EVAL", script, 1, lock.key, lock.token),
      "lock release",
    ) === 1;
  }

  async extendLock(lock: DistributedLock, ttlMilliseconds: number): Promise<boolean> {
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('PEXPIRE', KEYS[1], ARGV[2])
      end
      return 0
    `;
    return asNumber(
      await this.redis.command("EVAL", script, 1, lock.key, lock.token, ttlMilliseconds),
      "lock extension",
    ) === 1;
  }

  async reserveIdempotency(
    operation: string,
    key: string,
    requestHash: string,
    ttlSeconds = 86_400,
  ): Promise<IdempotencyReservation> {
    const tenantId = this.context.require().tenantId;
    const redisKey = `${this.prefix}:tenant:${tenantId}:idempotency:${safeSegment(operation, "Operation")}:${safeSegment(key, "Idempotency key")}`;
    const token = randomUUID();
    const value = JSON.stringify({ state: "processing", token, requestHash });
    const result = await this.redis.command("SET", redisKey, value, "NX", "EX", ttlSeconds);
    if (result === "OK") return { state: "reserved", token };
    const existingRaw = await this.redis.command("GET", redisKey);
    if (existingRaw === null) return this.reserveIdempotency(operation, key, requestHash, ttlSeconds);
    const existing = parseObject(asString(existingRaw, "idempotency"));
    if (existing?.requestHash !== requestHash) {
      throw new ConflictException("Idempotency key was used with a different request");
    }
    if (existing.state === "completed" && existing.response && typeof existing.response === "object") {
      return {
        state: "completed",
        response: existing.response as Readonly<Record<string, unknown>>,
      };
    }
    return { state: "processing" };
  }

  async completeIdempotency(
    operation: string,
    key: string,
    token: string,
    requestHash: string,
    response: Readonly<Record<string, unknown>>,
    ttlSeconds = 86_400,
  ): Promise<void> {
    const tenantId = this.context.require().tenantId;
    const redisKey = `${this.prefix}:tenant:${tenantId}:idempotency:${safeSegment(operation, "Operation")}:${safeSegment(key, "Idempotency key")}`;
    const script = `
      local current = redis.call('GET', KEYS[1])
      if not current then return 0 end
      local decoded = cjson.decode(current)
      if decoded.token ~= ARGV[1] or decoded.requestHash ~= ARGV[2] then return -1 end
      redis.call('SET', KEYS[1], ARGV[3], 'EX', ARGV[4])
      return 1
    `;
    const result = asNumber(
      await this.redis.command(
        "EVAL",
        script,
        1,
        redisKey,
        token,
        requestHash,
        JSON.stringify({ state: "completed", requestHash, response }),
        ttlSeconds,
      ),
      "idempotency completion",
    );
    if (result !== 1) throw new ConflictException("Idempotency reservation is stale or unavailable");
  }

  async health(): Promise<{ readonly available: boolean; readonly latencyMs: number }> {
    const startedAt = Date.now();
    const available = await this.redis.ping();
    return { available, latencyMs: Date.now() - startedAt };
  }

  private async cacheKey(namespace: string, key: string): Promise<string> {
    const tenantId = this.context.require().tenantId;
    const epochKey = this.namespaceEpochKey(tenantId, namespace);
    const epochRaw = await this.redis.command("GET", epochKey);
    const epoch = epochRaw === null ? 1 : asNumber(epochRaw, "namespace epoch");
    if (epochRaw === null) {
      await this.redis.command("SET", epochKey, epoch, "NX", "EX", 31_536_000);
    }
    return `${this.prefix}:tenant:${tenantId}:cache:${safeSegment(namespace, "Cache namespace")}:v${epoch}:${safeSegment(key, "Cache key")}`;
  }

  private namespaceEpochKey(tenantId: string, namespace: string): string {
    return `${this.prefix}:tenant:${tenantId}:epoch:${safeSegment(namespace, "Cache namespace")}`;
  }
}
