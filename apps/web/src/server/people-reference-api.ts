import type { PeopleOperationReferences } from "@veza/contracts";
import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 512 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loadPeopleReferences(
  institutionId: string,
): Promise<PeopleOperationReferences> {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return (await requestWorkspaceJson(
    `/v1/people/institutions/${institutionId}/references`,
    {
      service: "People references service",
      maximumBytes,
      timeoutMs: 15_000,
    },
  )) as PeopleOperationReferences;
}
