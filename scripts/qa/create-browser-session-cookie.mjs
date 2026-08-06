import { createCipheriv, randomBytes } from "node:crypto";

const encodedKey = process.env.OIDC_WEB_SESSION_ENCRYPTION_KEY;
if (!encodedKey) throw new Error("OIDC_WEB_SESSION_ENCRYPTION_KEY is required");
const key = Buffer.from(encodedKey, "base64");
if (key.length !== 32) throw new Error("OIDC_WEB_SESSION_ENCRYPTION_KEY must decode to 32 bytes");

const session = {
  accessToken: "qe-browser-token",
  expiresAt: Date.now() + 60 * 60 * 1000,
  profile: {
    subject: "qe-browser-operator",
    email: "operator@quality.veza.invalid",
    displayName: "Michael Ndhlovu",
  },
};
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
const ciphertext = Buffer.concat([
  cipher.update(Buffer.from(JSON.stringify(session), "utf8")),
  cipher.final(),
]);
const value = [
  "v1",
  iv.toString("base64url"),
  cipher.getAuthTag().toString("base64url"),
  ciphertext.toString("base64url"),
].join(".");

process.stdout.write(value);
