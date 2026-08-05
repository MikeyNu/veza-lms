import {
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import type { AuthenticatedPrincipal } from "@veza/contracts";
import { decodeJwt, jwtVerify, SignJWT } from "jose";
import { DatabaseService } from "../database/database.service.js";
import { TenantContext } from "../request-context/tenant-context.js";
import type {
  ClientCredentialsTokenDto,
  CreateServiceAccountDto,
  RotateServiceAccountSecretDto,
  UpdateServiceAccountStatusDto,
} from "./service-account.dto.js";

interface InternalClaims {
  readonly iss?: string;
  readonly sub?: string;
  readonly aud?: string | readonly string[];
  readonly tenant_id?: string;
  readonly service_account_id?: string;
  readonly client_id?: string;
  readonly scope?: string;
  readonly amr?: readonly string[];
}

function createClientId(): string {
  return `vz_${randomBytes(24).toString("base64url")}`;
}

function createSecret(): { readonly value: string; readonly prefix: string } {
  const value = `vzs_${randomBytes(36).toString("base64url")}`;
  return { value, prefix: value.slice(0, 10) };
}

function secretHash(secret: string, salt: string): string {
  return scryptSync(secret, salt, 32).toString("hex");
}

function normalizeReason(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

@Injectable()
export class ServiceAccountService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
  ) {}

  async create(input: CreateServiceAccountDto) {
    const context = this.context.require();
    const clientId = createClientId();
    const secret = createSecret();
    const salt = randomBytes(24).toString("base64url");
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const membership = await client.query(
        `SELECT membership.id
         FROM tenant_memberships membership
         JOIN users principal ON principal.id = membership.user_id
         WHERE membership.tenant_id = $1
           AND membership.user_id = $2
           AND membership.status = 'active'
           AND principal.status = 'active'`,
        [context.tenantId, input.principalUserId],
      );
      if (!membership.rowCount) {
        throw new BadRequestException("Service account principal requires an active tenant membership");
      }
      const account = await client.query<{ id: string }>(
        `INSERT INTO service_accounts (
           tenant_id, principal_user_id, client_id, display_name, scopes,
           allowed_ip_cidrs, token_ttl_seconds, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6::cidr[],$7,$8)
         RETURNING id`,
        [
          context.tenantId,
          input.principalUserId,
          clientId,
          input.displayName.trim(),
          [...new Set(input.scopes)].sort(),
          input.allowedIpCidrs ?? [],
          input.tokenTtlSeconds,
          context.actorId,
        ],
      );
      await client.query(
        `INSERT INTO service_account_secrets (
           service_account_id, secret_prefix, secret_salt, secret_hash, created_by
         ) VALUES ($1,$2,$3,$4,$5)`,
        [
          account.rows[0].id,
          secret.prefix,
          salt,
          secretHash(secret.value, salt),
          context.actorId,
        ],
      );
      return {
        id: account.rows[0].id,
        clientId,
        clientSecret: secret.value,
        secretPrefix: secret.prefix,
        scopes: [...new Set(input.scopes)].sort(),
        tokenTtlSeconds: input.tokenTtlSeconds,
        status: "active",
      };
    });
  }

  async rotateSecret(accountId: string, input: RotateServiceAccountSecretDto) {
    const context = this.context.require();
    const secret = createSecret();
    const salt = randomBytes(24).toString("base64url");
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const account = await client.query(
        `SELECT id FROM service_accounts WHERE id = $1 AND status = 'active' FOR UPDATE`,
        [accountId],
      );
      if (!account.rowCount) throw new NotFoundException("Active service account was not found");
      await client.query(
        `UPDATE service_account_secrets
         SET status = 'retired', retired_at = now()
         WHERE service_account_id = $1 AND status = 'active'`,
        [accountId],
      );
      await client.query(
        `INSERT INTO service_account_secrets (
           service_account_id, secret_prefix, secret_salt, secret_hash, created_by
         ) VALUES ($1,$2,$3,$4,$5)`,
        [accountId, secret.prefix, salt, secretHash(secret.value, salt), context.actorId],
      );
      await client.query(
        `UPDATE service_accounts SET version = version + 1, updated_at = now() WHERE id = $1`,
        [accountId],
      );
      return {
        id: accountId,
        clientSecret: secret.value,
        secretPrefix: secret.prefix,
        reason: normalizeReason(input.reason),
      };
    });
  }

  async updateStatus(accountId: string, input: UpdateServiceAccountStatusDto) {
    const context = this.context.require();
    const result = await this.database.withTenantTransaction(context.tenantId, (client) =>
      client.query(
        `UPDATE service_accounts
         SET status = $2, version = version + 1, updated_at = now()
         WHERE id = $1 AND status <> 'retired'
         RETURNING status, version`,
        [accountId, input.status],
      ),
    );
    if (!result.rowCount) throw new NotFoundException("Service account was not found");
    return {
      id: accountId,
      status: result.rows[0].status,
      version: result.rows[0].version,
      reason: normalizeReason(input.reason),
    };
  }

  async issueToken(
    input: ClientCredentialsTokenDto,
    authorization: string | undefined,
    sourceIp: string,
  ) {
    const credentials = this.resolveCredentials(input, authorization);
    const result = await this.database.controlPlaneQuery(
      `SELECT account.id, account.tenant_id, account.principal_user_id,
              account.client_id, account.scopes, account.allowed_ip_cidrs,
              account.token_ttl_seconds, account.status,
              secret.secret_salt, secret.secret_hash,
              principal.status principal_status
       FROM service_accounts account
       JOIN service_account_secrets secret
         ON secret.service_account_id = account.id AND secret.status = 'active'
       JOIN users principal ON principal.id = account.principal_user_id
       WHERE account.client_id = $1`,
      [credentials.clientId],
    );
    const account = result.rows[0];
    if (!account || account.status !== "active" || account.principal_status !== "active") {
      throw new UnauthorizedException("Client credentials are invalid");
    }
    const expected = Buffer.from(account.secret_hash, "hex");
    const actual = Buffer.from(secretHash(credentials.clientSecret, account.secret_salt), "hex");
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
      throw new UnauthorizedException("Client credentials are invalid");
    }
    if (account.allowed_ip_cidrs.length > 0) {
      const allowed = await this.database.controlPlaneQuery(
        "SELECT inet($1) <<= ANY($2::cidr[]) allowed",
        [sourceIp, account.allowed_ip_cidrs],
      );
      if (!allowed.rows[0]?.allowed) throw new ForbiddenException("Client source address is not allowed");
    }
    const requested = input.scope?.split(/\s+/).filter(Boolean) ?? account.scopes;
    if (requested.some((scope: string) => !account.scopes.includes(scope))) {
      throw new BadRequestException("Requested scope exceeds the service account grant");
    }
    const secret = this.signingSecret();
    const issuer = process.env.SERVICE_ACCOUNT_TOKEN_ISSUER ?? "https://api.veza.internal";
    const audience = process.env.SERVICE_ACCOUNT_TOKEN_AUDIENCE ?? "veza-api";
    const ttl = Number(account.token_ttl_seconds);
    const token = await new SignJWT({
      tenant_id: account.tenant_id,
      service_account_id: account.id,
      client_id: account.client_id,
      scope: requested.join(" "),
      amr: ["client_credentials"],
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: "veza-service-v1" })
      .setIssuer(issuer)
      .setAudience(audience)
      .setSubject(account.principal_user_id)
      .setJti(randomUUID())
      .setIssuedAt()
      .setExpirationTime(`${ttl}s`)
      .sign(secret);
    await this.database.controlPlaneQuery(
      "UPDATE service_accounts SET last_used_at = now() WHERE id = $1",
      [account.id],
    );
    return {
      access_token: token,
      token_type: "Bearer",
      expires_in: ttl,
      scope: requested.join(" "),
    };
  }

  async verifyInternalToken(token: string): Promise<AuthenticatedPrincipal | undefined> {
    let decoded: InternalClaims;
    try {
      decoded = decodeJwt(token) as InternalClaims;
    } catch {
      return undefined;
    }
    const issuer = process.env.SERVICE_ACCOUNT_TOKEN_ISSUER ?? "https://api.veza.internal";
    if (decoded.iss !== issuer) return undefined;
    const audience = process.env.SERVICE_ACCOUNT_TOKEN_AUDIENCE ?? "veza-api";
    const verified = await jwtVerify(token, this.signingSecret(), {
      issuer,
      audience,
      algorithms: ["HS256"],
    }).catch(() => null);
    if (!verified) throw new UnauthorizedException("Service access token is invalid");
    const claims = verified.payload as InternalClaims;
    if (!claims.sub || !claims.tenant_id || !claims.service_account_id || !claims.client_id) {
      throw new UnauthorizedException("Service access token claims are incomplete");
    }
    const result = await this.database.controlPlaneQuery(
      `SELECT account.id, account.client_id, account.status,
              principal.id user_id, principal.email, principal.display_name,
              principal.status principal_status
       FROM service_accounts account
       JOIN users principal ON principal.id = account.principal_user_id
       WHERE account.id = $1 AND account.tenant_id = $2
         AND account.client_id = $3 AND account.principal_user_id = $4`,
      [claims.service_account_id, claims.tenant_id, claims.client_id, claims.sub],
    );
    const account = result.rows[0];
    if (!account || account.status !== "active" || account.principal_status !== "active") {
      throw new UnauthorizedException("Service account is inactive");
    }
    return {
      userId: account.user_id,
      issuer,
      subject: claims.sub,
      email: account.email ?? undefined,
      displayName: account.display_name ?? account.client_id,
      status: "active",
      authenticationMethods: ["client_credentials"],
    };
  }

  private resolveCredentials(
    input: ClientCredentialsTokenDto,
    authorization: string | undefined,
  ): { readonly clientId: string; readonly clientSecret: string } {
    if (authorization?.startsWith("Basic ")) {
      const decoded = Buffer.from(authorization.slice(6), "base64").toString("utf8");
      const separator = decoded.indexOf(":");
      if (separator > 0) {
        return {
          clientId: decoded.slice(0, separator),
          clientSecret: decoded.slice(separator + 1),
        };
      }
    }
    if (!input.client_id || !input.client_secret) {
      throw new UnauthorizedException("Client credentials are required");
    }
    return { clientId: input.client_id, clientSecret: input.client_secret };
  }

  private signingSecret(): Uint8Array {
    const value = process.env.SERVICE_ACCOUNT_TOKEN_SIGNING_KEY;
    if (!value || Buffer.byteLength(value, "utf8") < 32) {
      throw new ConflictException("Service-account token signing is not configured");
    }
    return new TextEncoder().encode(value);
  }
}
