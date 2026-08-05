import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { completeAuthorization, createAuthorizationRequest, readSessionCookie } from "../dist/index.js";

const encryptionKey = Buffer.alloc(32, 7).toString("base64");
let server;
let baseUrl;
let privateKey;
let publicJwk;
let nonce;

const config = (sessionMaxAgeSeconds = 60) => ({
  issuer: baseUrl,
  authorizationEndpoint: `${baseUrl}/authorize`,
  tokenEndpoint: `${baseUrl}/token`,
  jwksUrl: `${baseUrl}/jwks`,
  clientId: "veza-qe",
  redirectUri: "http://127.0.0.1/callback",
  cookieEncryptionKey: encryptionKey,
  sessionMaxAgeSeconds,
});

test.before(async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  publicJwk = { ...(await exportJWK(keys.publicKey)), kid: "qe-key", alg: "RS256", use: "sig" };
  server = createServer(async (request, response) => {
    if (request.url === "/jwks") {
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ keys: [publicJwk] }));
      return;
    }
    if (request.url === "/token" && request.method === "POST") {
      const idToken = await new SignJWT({ nonce, email: "operator@example.invalid", email_verified: true, name: "QE Operator", amr: ["mfa"] })
        .setProtectedHeader({ alg: "RS256", kid: "qe-key" })
        .setIssuer(baseUrl)
        .setAudience("veza-qe")
        .setSubject("qe-operator")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ access_token: "signed-access-token", id_token: idToken, token_type: "Bearer", expires_in: 120 }));
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

test.after(async () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));

test("signed OIDC code exchange creates a readable server-side session", async () => {
  const request = createAuthorizationRequest(config(), { returnTo: "/admin/security" });
  const authorization = new URL(request.authorizationUrl);
  nonce = authorization.searchParams.get("nonce");
  const state = authorization.searchParams.get("state");
  assert.ok(nonce);
  assert.ok(state);
  const completed = await completeAuthorization(config(), { code: "qe-code", state, transactionCookie: request.transactionCookie });
  assert.equal(completed.returnTo, "/admin/security");
  assert.equal(completed.session.profile.subject, "qe-operator");
  assert.equal(completed.session.profile.email, "operator@example.invalid");
  assert.equal(readSessionCookie(config(), completed.sessionCookie).accessToken, "signed-access-token");
});

test("session expiry is enforced at cookie read time", async () => {
  const request = createAuthorizationRequest(config(0), {});
  const authorization = new URL(request.authorizationUrl);
  nonce = authorization.searchParams.get("nonce");
  const state = authorization.searchParams.get("state");
  const completed = await completeAuthorization(config(0), { code: "qe-code", state, transactionCookie: request.transactionCookie });
  await new Promise((resolve) => setTimeout(resolve, 2));
  assert.throws(() => readSessionCookie(config(0), completed.sessionCookie), /session has expired/i);
});
