import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";

let server;
let issuer;
let privateKey;
let publicJwk;
let PrincipalVerifier;
let MfaGuard;
let hasPlatformOperatorAssurance;

function executionContext(principal) {
  return {
    switchToHttp() {
      return {
        getRequest() {
          return { principal };
        },
      };
    },
  };
}

async function accessToken(authenticationMethods) {
  return new SignJWT({
    email: "operator@quality.veza.invalid",
    email_verified: true,
    name: "Quality operator",
    amr: authenticationMethods,
    veza_platform_roles: ["veza:platform-operator"],
  })
    .setProtectedHeader({ alg: "RS256", kid: "qe-assurance-key" })
    .setIssuer(issuer)
    .setAudience("https://api.veza.invalid")
    .setSubject("qe-platform-operator")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);
}

test.before(async () => {
  const keys = await generateKeyPair("RS256");
  privateKey = keys.privateKey;
  publicJwk = {
    ...(await exportJWK(keys.publicKey)),
    kid: "qe-assurance-key",
    alg: "RS256",
    use: "sig",
  };
  server = createServer((request, response) => {
    if (request.url !== "/jwks") {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  issuer = `http://127.0.0.1:${address.port}`;
  process.env.OIDC_ISSUER_URL = issuer;
  process.env.OIDC_AUDIENCE = "https://api.veza.invalid";
  process.env.OIDC_JWKS_URL = `${issuer}/jwks`;
  process.env.PLATFORM_OPERATOR_REQUIRED_AMR = "mfa";
  ({ PrincipalVerifier } = await import("../../dist/platform/authentication/principal-verifier.service.js"));
  ({ MfaGuard } = await import("../../dist/platform/authentication/mfa.guard.js"));
  ({ hasPlatformOperatorAssurance } = await import("../../dist/platform/authentication/platform-operator-assurance.js"));
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("signed API authentication enforces MFA step-up before privileged access", async () => {
  const verifier = new PrincipalVerifier();
  const guard = new MfaGuard();

  const initialPrincipal = await verifier.verifyAuthorizationHeader(`Bearer ${await accessToken(["pwd"])}`);
  assert.ok(initialPrincipal);
  assert.equal(hasPlatformOperatorAssurance(initialPrincipal), false);
  assert.throws(
    () => guard.canActivate(executionContext(initialPrincipal)),
    /Multi-factor authentication is required/i,
  );

  const steppedUpPrincipal = await verifier.verifyAuthorizationHeader(`Bearer ${await accessToken(["pwd", "mfa"])}`);
  assert.ok(steppedUpPrincipal);
  assert.equal(hasPlatformOperatorAssurance(steppedUpPrincipal), true);
  assert.equal(guard.canActivate(executionContext(steppedUpPrincipal)), true);
});
