import { createCipheriv, createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";

export interface EncryptedInvitationToken {
  readonly algorithm: "A256GCM";
  readonly iv: string;
  readonly authTag: string;
  readonly ciphertext: string;
  readonly keyVersion: string;
}

export interface InvitationSecret {
  readonly tokenDigest: string;
  readonly encryptedToken: EncryptedInvitationToken;
}

@Injectable()
export class InvitationTokenService {
  create(): InvitationSecret {
    const rawToken = randomBytes(32).toString("base64url");
    const tokenDigest = this.digest(rawToken);
    const key = this.encryptionKey();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(rawToken, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
      tokenDigest,
      encryptedToken: {
        algorithm: "A256GCM",
        iv: iv.toString("base64url"),
        authTag: authTag.toString("base64url"),
        ciphertext: ciphertext.toString("base64url"),
        keyVersion: process.env.INVITATION_TOKEN_KEY_VERSION ?? "v1",
      },
    };
  }

  digest(token: string): string {
    return createHash("sha256").update(token, "utf8").digest("hex");
  }

  matches(token: string, expectedDigest: string): boolean {
    const actual = Buffer.from(this.digest(token), "hex");
    const expected = Buffer.from(expectedDigest, "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private encryptionKey(): Buffer {
    const encoded = process.env.INVITATION_TOKEN_ENCRYPTION_KEY;
    if (!encoded) throw new ServiceUnavailableException("Invitation token encryption is not configured");
    const key = Buffer.from(encoded, "base64");
    if (key.length !== 32) {
      throw new ServiceUnavailableException("Invitation token encryption key must decode to 32 bytes");
    }
    return key;
  }
}
