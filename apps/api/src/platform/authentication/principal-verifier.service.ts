import { Injectable, UnauthorizedException } from "@nestjs/common";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import type { ExternalPrincipal } from "./external-principal.js";

const bearerPattern = /^Bearer\s+(.+)$/i;

function stringArrayClaim(payload: JWTPayload, claim: string): readonly string[] {
  const value = payload[claim];
  if (typeof value === "string") return [value];
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value;
  return [];
}

@Injectable()
export class PrincipalVerifier {
  private readonly issuer = process.env.OIDC_ISSUER_URL;
  private readonly audience = process.env.OIDC_AUDIENCE;
  private readonly jwksUrl = process.env.OIDC_JWKS_URL;
  private readonly jwks = this.jwksUrl ? createRemoteJWKSet(new URL(this.jwksUrl)) : undefined;

  async verifyAuthorizationHeader(header: string | undefined): Promise<ExternalPrincipal | undefined> {
    if (!header) return undefined;
    const match = bearerPattern.exec(header);
    if (!match?.[1]) throw new UnauthorizedException("Malformed bearer token");
    if (!this.issuer || !this.audience || !this.jwks) {
      throw new UnauthorizedException("Identity verification is not configured");
    }

    try {
      const { payload } = await jwtVerify(match[1], this.jwks, {
        issuer: this.issuer,
        audience: this.audience,
        algorithms: ["RS256", "ES256", "EdDSA"],
      });
      if (!payload.sub || !payload.iat) throw new UnauthorizedException("Identity token is missing required claims");

      return {
        issuer: this.issuer,
        subject: payload.sub,
        ...(typeof payload.email === "string" && payload.email_verified === true ? { email: payload.email } : {}),
        ...(typeof payload.name === "string" ? { displayName: payload.name } : {}),
        platformRoles: stringArrayClaim(payload, "veza_platform_roles"),
        authenticationMethods: stringArrayClaim(payload, "amr"),
        issuedAt: new Date(payload.iat * 1000).toISOString(),
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException("Bearer token could not be verified");
    }
  }
}
