import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type {
  AuthenticatedPrincipal,
  DeploymentTier,
  TenantId,
  TenantModuleKey,
  TenantStatus,
} from "@veza/contracts";
import type { QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { InvitationTokenService } from "../../identity-access/security/invitation-token.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { isPostgresError } from "../../../platform/database/database.types.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import type { ProvisionTenantDto } from "./provision-tenant.dto.js";

interface ProvisioningRequestRow extends QueryResultRow {
  readonly request_hash: string;
  readonly status: "processing" | "completed" | "failed";
  readonly response: ProvisionTenantResponse | null;
}

interface TenantIdRow extends QueryResultRow {
  readonly id: string;
}

export interface ProvisionTenantResponse {
  readonly tenant: {
    readonly id: TenantId;
    readonly slug: string;
    readonly displayName: string;
    readonly status: TenantStatus;
    readonly deploymentTier: DeploymentTier;
    readonly residencyRegion: string;
    readonly planKey: string;
    readonly modules: readonly TenantModuleKey[];
  };
  readonly ownerInvitation: {
    readonly id: string;
    readonly email: string;
    readonly deliveryStatus: "queued";
    readonly expiresAt: string;
  };
}

function canonicalRequest(input: ProvisionTenantDto): string {
  return JSON.stringify({
    displayName: input.displayName.trim(),
    legalName: input.legalName.trim(),
    slug: input.slug.trim().toLowerCase(),
    deploymentTier: input.deploymentTier,
    residencyRegion: input.residencyRegion,
    planKey: input.planKey,
    locale: input.locale,
    timezone: input.timezone,
    modules: [...input.modules].sort(),
    ownerEmail: input.ownerEmail.trim().toLowerCase(),
  });
}

@Injectable()
export class ProvisionTenantService {
  constructor(
    private readonly database: DatabaseService,
    private readonly invitationTokens: InvitationTokenService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async execute(
    principal: AuthenticatedPrincipal,
    input: ProvisionTenantDto,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<ProvisionTenantResponse> {
    if (!/^[A-Za-z0-9._:-]{16,128}$/.test(idempotencyKey)) {
      throw new BadRequestException("Idempotency-Key must be 16-128 URL-safe characters");
    }
    if (!input.modules.includes("core")) throw new BadRequestException("The core module is mandatory");

    const requestHash = createHash("sha256").update(canonicalRequest(input), "utf8").digest("hex");
    const normalized = {
      displayName: input.displayName.trim(),
      legalName: input.legalName.trim(),
      slug: input.slug.trim().toLowerCase(),
      ownerEmail: input.ownerEmail.trim().toLowerCase(),
      modules: [...input.modules].sort(),
    };

    return this.database.withControlPlaneTransaction(async (client) => {
      const insertedRequest = await client.query(
        `INSERT INTO provisioning_requests (idempotency_key, actor_id, request_hash, status)
         VALUES ($1,$2,$3,'processing')
         ON CONFLICT (idempotency_key) DO NOTHING
         RETURNING idempotency_key`,
        [idempotencyKey, principal.userId, requestHash],
      );
      if (insertedRequest.rowCount === 0) {
        const existingResult = await client.query<ProvisioningRequestRow>(
          `SELECT request_hash, status, response
           FROM provisioning_requests
           WHERE idempotency_key = $1
           FOR UPDATE`,
          [idempotencyKey],
        );
        const existing = existingResult.rows[0];
        if (!existing) throw new Error("Idempotency ledger is inconsistent");
        if (existing.request_hash !== requestHash) {
          throw new ConflictException("Idempotency-Key was already used for a different request");
        }
        if (existing.status === "completed" && existing.response) return existing.response;
        throw new ConflictException("The provisioning request is already in progress");
      }

      let tenantResult;
      try {
        tenantResult = await client.query<TenantIdRow>(
          `INSERT INTO tenants (
             slug, display_name, legal_name, status, deployment_tier,
             residency_region, plan_key, locale, timezone, created_by
           )
           SELECT $1,$2,$3,'provisioning',$4,$5,p.key,$7,$8,$9
           FROM plans p
           WHERE p.key = $6 AND p.active = true
           RETURNING id`,
          [
            normalized.slug,
            normalized.displayName,
            normalized.legalName,
            input.deploymentTier,
            input.residencyRegion,
            input.planKey,
            input.locale,
            input.timezone,
            principal.userId,
          ],
        );
      } catch (error) {
        if (isPostgresError(error, "23505", "tenants_slug_key")) {
          throw new ConflictException("Tenant slug is already in use");
        }
        throw error;
      }
      const tenantId = tenantResult.rows[0]?.id as TenantId | undefined;
      if (!tenantId) throw new BadRequestException("The selected plan is not available");

      for (const moduleKey of normalized.modules) {
        await client.query(
          `INSERT INTO tenant_entitlements (tenant_id, module_key, state)
           VALUES ($1,$2,'enabled')`,
          [tenantId, moduleKey],
        );
      }

      const invitationId = randomUUID();
      const invitation = this.invitationTokens.create();
      const expiresAt = new Date(Date.now() + 7 * 86_400_000);
      await client.query(
        `INSERT INTO membership_invitations (
           id, tenant_id, email, role_key, scope_type, scope_id,
           status, token_digest, expires_at, invited_by
         ) VALUES ($1,$2,$3,'tenant-owner','tenant',$2,'pending-delivery',$4,$5,$6)`,
        [invitationId, tenantId, normalized.ownerEmail, invitation.tokenDigest, expiresAt, principal.userId],
      );

      const response: ProvisionTenantResponse = {
        tenant: {
          id: tenantId,
          slug: normalized.slug,
          displayName: normalized.displayName,
          status: "provisioning",
          deploymentTier: input.deploymentTier,
          residencyRegion: input.residencyRegion,
          planKey: input.planKey,
          modules: normalized.modules,
        },
        ownerInvitation: {
          id: invitationId,
          email: normalized.ownerEmail,
          deliveryStatus: "queued",
          expiresAt: expiresAt.toISOString(),
        },
      };

      await this.audit.append(client, {
        tenantId,
        plane: "control",
        eventType: "tenant.provisioned",
        actorId: principal.userId,
        resourceType: "tenant",
        resourceId: tenantId,
        purpose: "customer provisioning",
        correlationId,
        afterState: {
          slug: normalized.slug,
          status: "provisioning",
          deploymentTier: input.deploymentTier,
          residencyRegion: input.residencyRegion,
          planKey: input.planKey,
          modules: normalized.modules,
        },
      });
      await this.outbox.append(client, {
        tenantId,
        eventName: "tenant.provisioned",
        eventVersion: 1,
        aggregateType: "tenant",
        aggregateId: tenantId,
        aggregateVersion: 1,
        actorId: principal.userId,
        correlationId,
        payload: {
          tenantId,
          slug: normalized.slug,
          deploymentTier: input.deploymentTier,
          residencyRegion: input.residencyRegion,
          planKey: input.planKey,
          modules: normalized.modules,
        },
      });
      await this.outbox.append(client, {
        tenantId,
        eventName: "identity.membership-invitation.requested",
        eventVersion: 1,
        aggregateType: "membership-invitation",
        aggregateId: invitationId,
        aggregateVersion: 1,
        actorId: principal.userId,
        correlationId,
        payload: {
          invitationId,
          email: normalized.ownerEmail,
          role: "tenant-owner",
          expiresAt: expiresAt.toISOString(),
          encryptedToken: invitation.encryptedToken,
        },
      });

      await client.query(
        `UPDATE provisioning_requests
         SET status = 'completed', tenant_id = $2, response = $3, updated_at = now()
         WHERE idempotency_key = $1`,
        [idempotencyKey, tenantId, response],
      );

      return response;
    });
  }
}
