import type { OidcBffConfig } from "@veza/oidc-bff";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function controlPlaneOidcConfig(): OidcBffConfig {
  return {
    issuer: required("OIDC_ISSUER_URL"),
    authorizationEndpoint: required("OIDC_AUTHORIZATION_URL"),
    tokenEndpoint: required("OIDC_TOKEN_URL"),
    jwksUrl: required("OIDC_JWKS_URL"),
    clientId: required("OIDC_CONTROL_PLANE_CLIENT_ID"),
    ...(process.env.OIDC_CONTROL_PLANE_CLIENT_SECRET ? { clientSecret: process.env.OIDC_CONTROL_PLANE_CLIENT_SECRET } : {}),
    redirectUri: required("OIDC_CONTROL_PLANE_REDIRECT_URI"),
    cookieEncryptionKey: required("OIDC_CONTROL_PLANE_SESSION_ENCRYPTION_KEY"),
  };
}

export const operatorSessionCookieName = "veza_operator_session";
export const operatorTransactionCookieName = "veza_operator_oidc_transaction";

export function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}
