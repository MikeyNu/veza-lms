import "server-only";

import { cookies } from "next/headers";
import { membershipCookieName } from "./auth-config";
import { demoModeEnabled } from "./demo-mode";
import { resolveDemoWorkspaceRequest } from "./demo-workspace-data";
import { getWebOidcSession } from "./web-session";

const membershipIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const defaultTimeoutMs = 20_000;
const maximumTimeoutMs = 60_000;

export class WorkspaceJsonRequestError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "WorkspaceJsonRequestError";
  }
}

export interface WorkspaceJsonRequestOptions {
  readonly service: string;
  readonly maximumBytes: number;
  readonly timeoutMs?: number;
  readonly init?: RequestInit;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function upstreamMessage(value: unknown, fallback: string): string {
  if (!isRecord(value) || typeof value.message !== "string") return fallback;
  const normalized = value.message.trim().replaceAll(/\s+/g, " ");
  return normalized ? normalized.slice(0, 400) : fallback;
}

function timeout(value: number | undefined): number {
  if (value === undefined) return defaultTimeoutMs;
  if (!Number.isInteger(value) || value < 1_000 || value > maximumTimeoutMs) {
    throw new WorkspaceJsonRequestError(500, "Workspace request timeout is invalid");
  }
  return value;
}

function responseLimit(value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 16 * 1024 * 1024) {
    throw new WorkspaceJsonRequestError(500, "Workspace response limit is invalid");
  }
  return value;
}

function apiUrl(path: string): URL {
  if (!path.startsWith("/v1/") || path.startsWith("//")) {
    throw new WorkspaceJsonRequestError(500, "Workspace API path is invalid");
  }
  const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
  return new URL(path, baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

async function credentials(): Promise<{
  readonly accessToken: string;
  readonly membershipId: string;
}> {
  const [session, cookieStore] = await Promise.all([getWebOidcSession(), cookies()]);
  const membershipId = cookieStore.get(membershipCookieName)?.value;
  if (!session || !membershipId || !membershipIdPattern.test(membershipId)) {
    throw new WorkspaceJsonRequestError(401, "An active workspace session is required");
  }
  return { accessToken: session.accessToken, membershipId };
}

export async function requestWorkspaceJson(
  path: string,
  options: WorkspaceJsonRequestOptions,
): Promise<unknown> {
  responseLimit(options.maximumBytes);
  timeout(options.timeoutMs);

  if (demoModeEnabled()) {
    return resolveDemoWorkspaceRequest(path, options.init);
  }

  const auth = await credentials();
  const maximumBytes = responseLimit(options.maximumBytes);
  const headers = new Headers(options.init?.headers);
  headers.set("authorization", `Bearer ${auth.accessToken}`);
  headers.set("x-veza-membership-id", auth.membershipId);
  headers.set("accept", "application/json");
  if (options.init?.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(apiUrl(path), {
    ...options.init,
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(timeout(options.timeoutMs)),
  });
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new WorkspaceJsonRequestError(
      502,
      `${options.service} returned an oversized response`,
    );
  }

  const text = await response.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new WorkspaceJsonRequestError(
      502,
      `${options.service} returned an oversized response`,
    );
  }

  let payload: unknown;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new WorkspaceJsonRequestError(502, `${options.service} returned invalid JSON`);
  }

  if (!response.ok) {
    throw new WorkspaceJsonRequestError(
      response.status,
      upstreamMessage(payload, `${options.service} request failed`),
    );
  }
  return payload;
}
