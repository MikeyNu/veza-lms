import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 256 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function request(path: string, input: Record<string, unknown>) {
  return (await requestWorkspaceJson(path, {
    service: "Credential definition service",
    maximumBytes,
    timeoutMs: 20_000,
    init: {
      method: "POST",
      body: JSON.stringify(input),
    },
  })) as Record<string, unknown>;
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
