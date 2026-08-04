import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("./src/index.ts", import.meta.url), "utf8");

test("OIDC BFF requires state, nonce, PKCE and authenticated encryption", () => {
  for (const term of ["code_challenge_method", "S256", "nonce", "timingSafeEqual", "aes-256-gcm", "setAuthTag"]) {
    assert.match(source, new RegExp(term));
  }
});

test("OIDC BFF rejects external return URLs", () => {
  assert.match(source, /value\.startsWith\("\/"\)/);
  assert.match(source, /value\.startsWith\("\/\/"\)/);
  assert.match(source, /destination\.origin !== base\.origin/);
});
