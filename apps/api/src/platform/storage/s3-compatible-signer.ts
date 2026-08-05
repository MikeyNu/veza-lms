import { createHash, createHmac } from "node:crypto";
import { Injectable, ServiceUnavailableException } from "@nestjs/common";

interface PresignInput {
  readonly bucket: string;
  readonly key: string;
  readonly method: "PUT" | "GET" | "HEAD" | "DELETE";
  readonly expiresSeconds: number;
  readonly contentType?: string;
  readonly checksumSha256?: string;
}

interface StorageSigningConfiguration {
  readonly endpoint: URL;
  readonly region: string;
  readonly accessKey: string;
  readonly secretKey: string;
  readonly sessionToken?: string;
  readonly forcePathStyle: boolean;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value, "utf8").digest();
}

function encode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function canonicalKey(key: string): string {
  return key.split("/").map(encode).join("/");
}

function timestamp(date: Date): { readonly amz: string; readonly day: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amz: iso, day: iso.slice(0, 8) };
}

@Injectable()
export class S3CompatibleSigner {
  presign(input: PresignInput): {
    readonly url: string;
    readonly requiredHeaders: Readonly<Record<string, string>>;
    readonly expiresAt: string;
  } {
    const configuration = this.configuration();
    const now = new Date();
    const expiresSeconds = Math.max(60, Math.min(3600, input.expiresSeconds));
    const expiresAt = new Date(now.getTime() + expiresSeconds * 1000);
    const { amz, day } = timestamp(now);
    const scope = `${day}/${configuration.region}/s3/aws4_request`;
    const host = configuration.forcePathStyle
      ? configuration.endpoint.host
      : `${input.bucket}.${configuration.endpoint.host}`;
    const path = configuration.forcePathStyle
      ? `/${encode(input.bucket)}/${canonicalKey(input.key)}`
      : `/${canonicalKey(input.key)}`;
    const signedHeaders = ["host"];
    const headers: Record<string, string> = {};
    if (input.contentType) {
      signedHeaders.push("content-type");
      headers["content-type"] = input.contentType;
    }
    if (input.checksumSha256) {
      signedHeaders.push("x-amz-checksum-sha256");
      headers["x-amz-checksum-sha256"] = Buffer.from(input.checksumSha256, "hex").toString(
        "base64",
      );
    }
    signedHeaders.sort();
    const query = new URLSearchParams({
      "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
      "X-Amz-Credential": `${configuration.accessKey}/${scope}`,
      "X-Amz-Date": amz,
      "X-Amz-Expires": String(expiresSeconds),
      "X-Amz-SignedHeaders": signedHeaders.join(";"),
      ...(configuration.sessionToken
        ? { "X-Amz-Security-Token": configuration.sessionToken }
        : {}),
    });
    const canonicalQuery = [...query.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `${encode(key)}=${encode(value)}`)
      .join("&");
    const canonicalHeaders = signedHeaders
      .map((header) => `${header}:${header === "host" ? host : headers[header].trim()}\n`)
      .join("");
    const canonicalRequest = [
      input.method,
      path,
      canonicalQuery,
      canonicalHeaders,
      signedHeaders.join(";"),
      "UNSIGNED-PAYLOAD",
    ].join("\n");
    const stringToSign = [
      "AWS4-HMAC-SHA256",
      amz,
      scope,
      sha256(canonicalRequest),
    ].join("\n");
    const signingKey = hmac(
      hmac(
        hmac(hmac(`AWS4${configuration.secretKey}`, day), configuration.region),
        "s3",
      ),
      "aws4_request",
    );
    const signature = createHmac("sha256", signingKey)
      .update(stringToSign, "utf8")
      .digest("hex");
    query.set("X-Amz-Signature", signature);
    const origin = `${configuration.endpoint.protocol}//${host}`;
    return {
      url: `${origin}${path}?${query.toString()}`,
      requiredHeaders: headers,
      expiresAt: expiresAt.toISOString(),
    };
  }

  signedDeliveryUrl(
    cdnDomain: string,
    objectKey: string,
    tenantId: string,
    expiresSeconds = 900,
  ): { readonly url: string; readonly expiresAt: string } {
    const signingKey = process.env.MEDIA_DELIVERY_SIGNING_KEY;
    if (!signingKey) {
      throw new ServiceUnavailableException("Media delivery signing is not configured");
    }
    const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, Math.min(3600, expiresSeconds));
    const path = `/${canonicalKey(objectKey)}`;
    const payload = `${tenantId}\n${path}\n${expiresAt}`;
    const signature = createHmac("sha256", signingKey)
      .update(payload, "utf8")
      .digest("base64url");
    return {
      url: `https://${cdnDomain}${path}?tenant=${encode(tenantId)}&expires=${expiresAt}&signature=${encode(signature)}`,
      expiresAt: new Date(expiresAt * 1000).toISOString(),
    };
  }

  private configuration(): StorageSigningConfiguration {
    const endpoint = process.env.OBJECT_STORAGE_ENDPOINT?.trim();
    const region = process.env.OBJECT_STORAGE_REGION?.trim();
    const accessKey = process.env.OBJECT_STORAGE_ACCESS_KEY_ID?.trim();
    const secretKey = process.env.OBJECT_STORAGE_SECRET_ACCESS_KEY?.trim();
    if (!endpoint || !region || !accessKey || !secretKey) {
      throw new ServiceUnavailableException("Object storage signing is not configured");
    }
    return {
      endpoint: new URL(endpoint),
      region,
      accessKey,
      secretKey,
      sessionToken: process.env.OBJECT_STORAGE_SESSION_TOKEN?.trim() || undefined,
      forcePathStyle: process.env.OBJECT_STORAGE_FORCE_PATH_STYLE !== "false",
    };
  }
}
