import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

export interface OidcBffConfig {
  readonly issuer: string;
  readonly authorizationEndpoint: string;
  readonly tokenEndpoint: string;
  readonly jwksUrl: string;
  readonly clientId: string;
  readonly clientSecret?: string;
  readonly redirectUri: string;
  readonly cookieEncryptionKey: string;
  readonly scope?: string;
  readonly transactionTtlSeconds?: number;
  readonly sessionMaxAgeSeconds?: number;
}

export interface OidcProfile {
  readonly subject: string;
  readonly email?: string;
  readonly displayName?: string;
}

export interface OidcSession {
  readonly accessToken: string;
  readonly expiresAt: number;
  readonly profile: OidcProfile;
}

interface AuthorizationTransaction {
  readonly state: string;
  readonly nonce: string;
  readonly codeVerifier: string;
  readonly returnTo: string;
  readonly createdAt: number;
}

interface TokenResponse {
  readonly access_token?: unknown;
  readonly id_token?: unknown;
  readonly token_type?: unknown;
  readonly expires_in?: unknown;
}

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
const maximumCookieLength = 3_800;
const maximumTokenResponseLength = 64 * 1024;

function encryptionKey(encoded: string): Buffer {
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) throw new Error("OIDC cookie encryption key must decode to 32 bytes");
  return key;
}

function seal<T>(value: T, encodedKey: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(encodedKey), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const sealed = ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(".");
  if (sealed.length > maximumCookieLength) {
    throw new Error("Encrypted OIDC state exceeds the safe browser cookie size");
  }
  return sealed;
}

function unseal<T>(value: string, encodedKey: string): T {
  const [version, ivValue, tagValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) throw new Error("Encrypted cookie is malformed");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(encodedKey), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]);
  return JSON.parse(plaintext.toString("utf8")) as T;
}

function safeEquals(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function localReturnTo(value: string | null | undefined): string {
  if (
    !value ||
    value.length > 2_048 ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/";
  }

  try {
    const base = new URL("https://veza.invalid");
    const destination = new URL(value, base);
    if (destination.origin !== base.origin) return "/";
    return `${destination.pathname}${destination.search}${destination.hash}`;
  } catch {
    return "/";
  }
}

function formEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, "+");
}

function verifiedProfile(payload: JWTPayload): OidcProfile {
  if (!payload.sub) throw new Error("ID token is missing a subject");
  return {
    subject: payload.sub,
    ...(typeof payload.email === "string" && payload.email_verified === true ? { email: payload.email } : {}),
    ...(typeof payload.name === "string" ? { displayName: payload.name } : {}),
  };
}

function validateAuthorizedParty(payload: JWTPayload, clientId: string): void {
  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  const authorizedParty = payload.azp;
  if (audiences.length > 1 && authorizedParty !== clientId) {
    throw new Error("ID token authorized-party validation failed");
  }
  if (typeof authorizedParty === "string" && authorizedParty !== clientId) {
    throw new Error("ID token was issued to a different client");
  }
}

function keySet(url: string): ReturnType<typeof createRemoteJWKSet> {
  const existing = jwksCache.get(url);
  if (existing) return existing;
  const created = createRemoteJWKSet(new URL(url));
  jwksCache.set(url, created);
  return created;
}

async function tokenResponse(response: Response): Promise<TokenResponse> {
  const contentLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > maximumTokenResponseLength) {
    throw new Error("OIDC token response is unexpectedly large");
  }
  const body = await response.text();
  if (body.length > maximumTokenResponseLength) throw new Error("OIDC token response is unexpectedly large");
  try {
    return JSON.parse(body) as TokenResponse;
  } catch {
    throw new Error("OIDC token response is not valid JSON");
  }
}

export function createAuthorizationRequest(
  config: OidcBffConfig,
  input: { readonly returnTo?: string | null; readonly loginHint?: string | null },
): { readonly authorizationUrl: string; readonly transactionCookie: string } {
  const state = randomBytes(24).toString("base64url");
  const nonce = randomBytes(24).toString("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
  const transaction: AuthorizationTransaction = {
    state,
    nonce,
    codeVerifier,
    returnTo: localReturnTo(input.returnTo),
    createdAt: Date.now(),
  };
  const url = new URL(config.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scope ?? "openid profile email");
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  if (input.loginHint) url.searchParams.set("login_hint", input.loginHint);
  return {
    authorizationUrl: url.toString(),
    transactionCookie: seal(transaction, config.cookieEncryptionKey),
  };
}

export async function completeAuthorization(
  config: OidcBffConfig,
  input: {
    readonly code: string;
    readonly state: string;
    readonly transactionCookie: string;
  },
): Promise<{ readonly sessionCookie: string; readonly session: OidcSession; readonly returnTo: string }> {
  const transaction = unseal<AuthorizationTransaction>(input.transactionCookie, config.cookieEncryptionKey);
  const transactionTtl = (config.transactionTtlSeconds ?? 600) * 1000;
  const transactionAge = Date.now() - transaction.createdAt;
  if (transactionAge < -30_000 || transactionAge > transactionTtl) throw new Error("OIDC transaction has expired");
  if (!safeEquals(input.state, transaction.state)) throw new Error("OIDC state validation failed");

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
    code_verifier: transaction.codeVerifier,
  });
  const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded" };
  if (config.clientSecret) {
    headers.authorization = `Basic ${Buffer.from(`${formEncode(config.clientId)}:${formEncode(config.clientSecret)}`, "utf8").toString("base64")}`;
    body.delete("client_id");
  }
  const response = await fetch(config.tokenEndpoint, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`OIDC token exchange failed with status ${response.status}`);
  const tokens = await tokenResponse(response);
  if (
    typeof tokens.access_token !== "string" ||
    typeof tokens.id_token !== "string" ||
    typeof tokens.token_type !== "string" ||
    tokens.token_type.toLowerCase() !== "bearer" ||
    typeof tokens.expires_in !== "number" ||
    !Number.isFinite(tokens.expires_in) ||
    tokens.expires_in <= 0
  ) {
    throw new Error("OIDC token response is incomplete");
  }

  const { payload } = await jwtVerify(tokens.id_token, keySet(config.jwksUrl), {
    issuer: config.issuer,
    audience: config.clientId,
    algorithms: ["RS256", "ES256", "EdDSA"],
  });
  validateAuthorizedParty(payload, config.clientId);
  if (typeof payload.nonce !== "string" || !safeEquals(payload.nonce, transaction.nonce)) {
    throw new Error("OIDC nonce validation failed");
  }
  const sessionLifetime = Math.min(tokens.expires_in, config.sessionMaxAgeSeconds ?? 3_600);
  const session: OidcSession = {
    accessToken: tokens.access_token,
    expiresAt: Date.now() + sessionLifetime * 1000,
    profile: verifiedProfile(payload),
  };
  return {
    session,
    sessionCookie: seal(session, config.cookieEncryptionKey),
    returnTo: transaction.returnTo,
  };
}

export function readSessionCookie(config: Pick<OidcBffConfig, "cookieEncryptionKey">, value: string): OidcSession {
  const session = unseal<OidcSession>(value, config.cookieEncryptionKey);
  if (!session.accessToken || !session.profile?.subject || session.expiresAt <= Date.now()) {
    throw new Error("OIDC session has expired");
  }
  return session;
}

export function secureReturnTo(value: string | null | undefined): string {
  return localReturnTo(value);
}

export function isSameOriginRequest(requestUrl: string, originHeader: string | null): boolean {
  if (!originHeader) return false;
  try {
    return new URL(originHeader).origin === new URL(requestUrl).origin;
  } catch {
    return false;
  }
}
