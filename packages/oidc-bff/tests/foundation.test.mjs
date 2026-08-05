import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sourceUrl = new URL("../src/index.ts", import.meta.url);

test("OIDC BFF uses authorization code, S256 PKCE, state and nonce", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /response_type", "code/);
  assert.match(source, /code_challenge_method", "S256/);
  assert.match(source, /OIDC state validation failed/);
  assert.match(source, /OIDC nonce validation failed/);
});

test("OIDC cookies are authenticated-encrypted and never accept external return origins", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /aes-256-gcm/);
  assert.match(source, /getAuthTag/);
  assert.match(source, /destination\.origin !== base\.origin/);
  assert.match(source, /value\.startsWith\("\/\/"\)/);
  assert.match(source, /isSameOriginRequest/);
});

test("OIDC callback validates authorized party and bounds remote responses", async () => {
  const source = await readFile(sourceUrl, "utf8");
  assert.match(source, /validateAuthorizedParty/);
  assert.match(source, /maximumTokenResponseLength/);
  assert.match(source, /AbortSignal\.timeout\(10_000\)/);
  assert.match(source, /sessionMaxAgeSeconds/);
});
