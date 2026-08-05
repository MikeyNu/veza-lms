const credentialAssignment = /\b(authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|secret)\b\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/gi;
const bearerToken = /\bBearer\s+[A-Za-z0-9._~+/=-]+/gi;

export function sanitizeDeliveryError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(credentialAssignment, "$1=[redacted]")
    .replace(bearerToken, "Bearer [redacted]")
    .slice(0, 2_000);
}
