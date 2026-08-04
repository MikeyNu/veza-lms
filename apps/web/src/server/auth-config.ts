import type { OidcBffConfig } from "@veza/oidc-bff";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function webOidcConfig(): OidcBffConfig {
  return {
    issuer: required("OIDC_ISSUER_URL"),
    authorizationEndpoint: required("OIDC_AUTHORIZATION_URL"),
    tokenEndpoint: required("OIDC_TOKEN_URL"),
    jwksUrl: required("OIDC_JWKS_URL"),
    clientId: required("OIDC_WEB_CLIENT_ID"),
    ...(process.env.OIDC_WEB_CLIENT_SECRET ? { clientSecret: process.env.OIDC_WEB_CLIENT_SECRET } : {}),
    redirectUri: required("OIDC_WEB_REDIRECT_URI"),
    cookieEncryptionKey: required("OIDC_WEB_SESSION_ENCRYPTION_KEY"),
  };
}

export const webSessionCookieName = "veza_web_session";
export const webTransactionCookieName = "veza_web_oidc_transaction";
export const membershipCookieName = "veza_membership";
export const returnToCookieName = "veza_return_to";

export function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}
