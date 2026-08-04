import { randomUUID } from "node:crypto";
import { isSameOriginRequest } from "@veza/oidc-bff";
import type { DeploymentTier, TenantModuleKey, TenantStatus } from "@veza/contracts";
import { NextResponse, type NextRequest } from "next/server";
import { getOperatorSession } from "../../../src/server/operator-session";

const maximumRequestBytes = 64 * 1024;
const maximumResponseBytes = 256 * 1024;
const noStoreHeaders = { "cache-control": "no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tenantStatuses = new Set<TenantStatus>(["provisioning", "active", "suspended", "offboarding", "closed"]);
const deploymentTiers = new Set<DeploymentTier>(["shared", "protected", "sovereign"]);
const moduleKeys = new Set<TenantModuleKey>([
  "core", "studio-pro", "exams", "commerce", "advanced-analytics",
  "credentials", "guardian-portal", "ai-assist", "integration-hub",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProvisioningResponse(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.tenant) || !isRecord(value.ownerInvitation)) return false;
  const tenant = value.tenant;
  const invitation = value.ownerInvitation;
  return typeof tenant.id === "string" && uuidPattern.test(tenant.id)
    && typeof tenant.slug === "string" && tenant.slug.length > 0
    && typeof tenant.displayName === "string" && tenant.displayName.length > 0
    && typeof tenant.status === "string" && tenantStatuses.has(tenant.status as TenantStatus)
    && typeof tenant.deploymentTier === "string" && deploymentTiers.has(tenant.deploymentTier as DeploymentTier)
    && typeof tenant.residencyRegion === "string" && tenant.residencyRegion.length > 0
    && typeof tenant.planKey === "string" && tenant.planKey.length > 0
    && Array.isArray(tenant.modules)
    && tenant.modules.length > 0
    && tenant.modules.every((item) => typeof item === "string" && moduleKeys.has(item as TenantModuleKey))
    && typeof invitation.id === "string" && uuidPattern.test(invitation.id)
    && typeof invitation.email === "string" && invitation.email.length > 0
    && invitation.deliveryStatus === "queued"
    && typeof invitation.expiresAt === "string" && Number.isFinite(Date.parse(invitation.expiresAt));
}

function safeError(value: unknown, status: number): string {
  if (isRecord(value)) {
    if (typeof value.message === "string" && value.message.length <= 240) return value.message;
    if (Array.isArray(value.message) && value.message.every((item) => typeof item === "string")) {
      return value.message.slice(0, 4).join(" ").slice(0, 240);
    }
  }
  if (status === 409) return "The provisioning request conflicts with an existing tenant or request key.";
  if (status === 403) return "The operator is not authorised to provision a tenant.";
  return "Provisioning could not be completed.";
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request.url, request.headers.get("origin"))) {
    return NextResponse.json({ message: "Cross-origin provisioning is not allowed." }, { status: 403, headers: noStoreHeaders });
  }
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return NextResponse.json({ message: "Provisioning requests must use application/json." }, { status: 415, headers: noStoreHeaders });
  }

  const session = await getOperatorSession();
  if (!session) return NextResponse.json({ message: "Platform operator session is required." }, { status: 401, headers: noStoreHeaders });

  const idempotencyKey = request.headers.get("idempotency-key");
  if (!idempotencyKey || !/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
    return NextResponse.json({ message: "A valid idempotency key is required." }, { status: 400, headers: noStoreHeaders });
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(contentLength) || contentLength > maximumRequestBytes) {
    return NextResponse.json({ message: "Provisioning request is too large." }, { status: 413, headers: noStoreHeaders });
  }
  const body = await request.text();
  if (body.length > maximumRequestBytes) {
    return NextResponse.json({ message: "Provisioning request is too large." }, { status: 413, headers: noStoreHeaders });
  }
  try { JSON.parse(body); } catch {
    return NextResponse.json({ message: "Provisioning request is invalid JSON." }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const apiBaseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
    const upstream = await fetch(`${apiBaseUrl}/v1/control-plane/tenants`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.oidc.accessToken}`,
        "content-type": "application/json",
        "idempotency-key": idempotencyKey,
        "x-correlation-id": randomUUID(),
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    const declaredLength = Number(upstream.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredLength) && declaredLength > maximumResponseBytes) {
      return NextResponse.json({ message: "Provisioning service response was invalid." }, { status: 502, headers: noStoreHeaders });
    }
    const text = await upstream.text();
    if (text.length > maximumResponseBytes) {
      return NextResponse.json({ message: "Provisioning service response was invalid." }, { status: 502, headers: noStoreHeaders });
    }
    let payload: unknown;
    try { payload = JSON.parse(text) as unknown; } catch {
      return NextResponse.json({ message: "Provisioning service response was invalid." }, { status: 502, headers: noStoreHeaders });
    }
    if (!upstream.ok) {
      return NextResponse.json({ message: safeError(payload, upstream.status) }, { status: upstream.status, headers: noStoreHeaders });
    }
    if (!isProvisioningResponse(payload)) {
      return NextResponse.json({ message: "Provisioning service response did not match the contract." }, { status: 502, headers: noStoreHeaders });
    }
    return NextResponse.json(payload, { status: upstream.status, headers: noStoreHeaders });
  } catch {
    return NextResponse.json({ message: "Provisioning service is unavailable." }, { status: 503, headers: noStoreHeaders });
  }
}
