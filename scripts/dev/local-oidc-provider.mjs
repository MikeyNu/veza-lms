/**
 * Minimal OIDC provider for local development only.
 *
 * The product expects a real identity provider (OIDC_ISSUER_URL). There is no
 * IdP in docker-compose, so local runs of the web and control-plane apps cannot
 * complete a sign-in. This server implements just enough of the authorization
 * code + PKCE flow for the BFF in packages/oidc-bff to obtain a session, and
 * issues access tokens that apps/api can verify through its JWKS.
 *
 * It auto-approves every authorization request. NEVER run this outside a
 * development machine.
 */
import { createServer } from "node:http";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { exportJWK, exportPKCS8, generateKeyPair, importPKCS8, SignJWT } from "jose";

const port = Number(process.env.DEV_OIDC_PORT ?? 4500);
const issuer = process.env.DEV_OIDC_ISSUER ?? `http://localhost:${port}/`;
const audience = process.env.DEV_OIDC_AUDIENCE ?? "http://localhost:4000";
const keyId = "dev-key-1";
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../..");
const keyFile = path.join(repoRoot, ".dev", "oidc-signing-key.pem");

// Persist the signing key so a provider restart does not invalidate tokens the
// API has already cached a JWKS for.
async function signingKey() {
  try {
    return await importPKCS8(await readFile(keyFile, "utf8"), "RS256");
  } catch {
    const { privateKey } = await generateKeyPair("RS256", { extractable: true });
    await mkdir(path.dirname(keyFile), { recursive: true });
    await writeFile(keyFile, await exportPKCS8(privateKey), "utf8");
    return privateKey;
  }
}

const privateKey = await signingKey();
const publicJwk = { ...(await exportJWK(privateKey)), kid: keyId, alg: "RS256", use: "sig" };
delete publicJwk.d;
delete publicJwk.p;
delete publicJwk.q;
delete publicJwk.dp;
delete publicJwk.dq;
delete publicJwk.qi;

/** Accounts this provider can sign in as, selected with ?login_hint=<key>. */
const accounts = {
  owner: {
    sub: "dev-tenant-owner",
    email: "owner@akha.example",
    name: "Thandi Mokoena",
    platformRoles: [],
  },
  operator: {
    sub: "dev-platform-operator",
    email: "operator@veza.example",
    name: "Platform Operator",
    platformRoles: ["platform-operator", "platform-admin"],
  },
};

const defaultAccount = process.env.DEV_OIDC_ACCOUNT ?? "owner";
const codes = new Map();

function accountFor(hint) {
  if (hint && accounts[hint]) return accounts[hint];
  return accounts[defaultAccount] ?? accounts.owner;
}

async function mintTokens(account, clientId, nonce) {
  const now = Math.floor(Date.now() / 1000);
  const base = () =>
    new SignJWT({
      email: account.email,
      email_verified: true,
      name: account.name,
      amr: ["pwd", "mfa"],
    })
      .setProtectedHeader({ alg: "RS256", kid: keyId })
      .setIssuer(issuer)
      .setSubject(account.sub)
      .setIssuedAt(now)
      .setExpirationTime(now + 3600);

  const accessToken = await base()
    .setAudience(audience)
    .setJti(randomUUID())
    // apps/api reads platform roles from this claim.
    .sign(privateKey);

  const idToken = await new SignJWT({
    email: account.email,
    email_verified: true,
    name: account.name,
    nonce,
    azp: clientId,
  })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(issuer)
    .setSubject(account.sub)
    .setAudience(clientId)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(privateKey);

  return { accessToken, idToken };
}

async function mintAccessTokenWithRoles(account) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    email: account.email,
    email_verified: true,
    name: account.name,
    amr: ["pwd", "mfa"],
    veza_platform_roles: account.platformRoles,
  })
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(issuer)
    .setSubject(account.sub)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .setJti(randomUUID())
    .sign(privateKey);
}

function send(response, status, body, contentType = "application/json") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  response.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store",
  });
  response.end(payload);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://localhost:${port}`);

  if (url.pathname === "/.well-known/openid-configuration") {
    return send(response, 200, {
      issuer,
      authorization_endpoint: `${issuer}authorize`,
      token_endpoint: `${issuer}token`,
      jwks_uri: `${issuer}.well-known/jwks.json`,
      response_types_supported: ["code"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
      code_challenge_methods_supported: ["S256"],
    });
  }

  if (url.pathname === "/.well-known/jwks.json") {
    return send(response, 200, { keys: [publicJwk] });
  }

  if (url.pathname === "/authorize") {
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");
    if (!redirectUri || !state) return send(response, 400, { error: "invalid_request" });

    const code = randomUUID();
    codes.set(code, {
      account: accountFor(url.searchParams.get("login_hint")),
      clientId: url.searchParams.get("client_id") ?? "",
      nonce: url.searchParams.get("nonce") ?? "",
      codeChallenge: url.searchParams.get("code_challenge") ?? "",
      createdAt: Date.now(),
    });

    const target = new URL(redirectUri);
    target.searchParams.set("code", code);
    target.searchParams.set("state", state);
    response.writeHead(302, { location: target.toString() });
    return response.end();
  }

  if (url.pathname === "/token" && request.method === "POST") {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const form = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
    const record = codes.get(form.get("code") ?? "");
    if (!record) return send(response, 400, { error: "invalid_grant" });
    codes.delete(form.get("code") ?? "");

    const verifier = form.get("code_verifier") ?? "";
    const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
    if (record.codeChallenge && challenge !== record.codeChallenge) {
      return send(response, 400, { error: "invalid_grant", error_description: "PKCE mismatch" });
    }

    const clientId =
      form.get("client_id") ??
      (() => {
        const header = request.headers.authorization ?? "";
        if (!header.startsWith("Basic ")) return record.clientId;
        const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
        return decodeURIComponent(decoded.split(":")[0] ?? record.clientId);
      })();

    const { idToken } = await mintTokens(record.account, clientId, record.nonce);
    const accessToken = await mintAccessTokenWithRoles(record.account);
    return send(response, 200, {
      access_token: accessToken,
      id_token: idToken,
      token_type: "Bearer",
      expires_in: 3600,
    });
  }

  // Convenience for scripts that need a bearer token without a browser.
  if (url.pathname === "/dev/token") {
    const account = accountFor(url.searchParams.get("account"));
    return send(response, 200, { access_token: await mintAccessTokenWithRoles(account), subject: account.sub });
  }

  send(response, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`Local OIDC provider on ${issuer} (accounts: ${Object.keys(accounts).join(", ")})\n`);
});
