import { getWebOidcSession } from "./web-session";

const baseUrl = process.env.VEZA_API_BASE_URL ?? "http://localhost:4000";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function request(path: string, input: Record<string, unknown>) {
  const session = await getWebOidcSession();
  if (!session) throw new Error("Workspace authentication is required");
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.accessToken}`,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new Error(
      typeof body.message === "string" ? body.message.slice(0, 400) : "Credential definition failed",
    );
  }
  return body;
}

export function createCredentialDefinition(
  institutionId: string,
  operation: "certificate-template" | "award-rule",
  input: Record<string, unknown>,
) {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  const resource = operation === "certificate-template" ? "templates" : "award-rules";
  return request(
    `/v1/academic-evidence/institutions/${institutionId}/credential-definitions/${resource}`,
    input,
  );
}
