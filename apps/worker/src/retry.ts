import { createHash } from "node:crypto";

export function retryDelaySeconds(
  eventId: string,
  attempts: number,
  baseSeconds: number,
  maximumSeconds: number,
): number {
  const exponent = Math.max(0, Math.min(attempts - 1, 20));
  const exponential = Math.min(maximumSeconds, baseSeconds * 2 ** exponent);
  const digest = createHash("sha256").update(`${eventId}:${attempts}`, "utf8").digest();
  const jitter = 0.8 + (digest.readUInt16BE(0) / 65_535) * 0.4;
  return Math.max(1, Math.min(maximumSeconds, Math.round(exponential * jitter)));
}

export function nextAttemptAt(now: Date, delaySeconds: number): Date {
  return new Date(now.getTime() + delaySeconds * 1_000);
}
