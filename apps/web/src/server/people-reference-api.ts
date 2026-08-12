import type { PeopleOperationReferences } from "@veza/contracts";
import {
  optionalString,
  requireRecord,
  requireRecordArray,
  requireString,
  requireStringArray,
} from "./json-contract";
import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 512 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseReferences(value: unknown, institutionId: string): PeopleOperationReferences {
  const record = requireRecord(value, "People references response");
  const responseInstitutionId = requireString(record.institutionId, "People references institutionId");
  if (responseInstitutionId !== institutionId) {
    throw new Error("People references response crossed the requested institution boundary");
  }
  return {
    institutionId: responseInstitutionId,
    organisationalUnits: requireRecordArray(record.organisationalUnits, "People references organisationalUnits").map((unit, index) => ({
      id: requireString(unit.id, `People references organisationalUnits[${index}].id`),
      code: requireString(unit.code, `People references organisationalUnits[${index}].code`),
      displayName: requireString(unit.displayName, `People references organisationalUnits[${index}].displayName`),
      unitType: requireString(unit.unitType, `People references organisationalUnits[${index}].unitType`),
    })),
    linkableIdentities: requireRecordArray(record.linkableIdentities, "People references linkableIdentities").map((identity, index) => ({
      userId: requireString(identity.userId, `People references linkableIdentities[${index}].userId`),
      displayName: requireString(identity.displayName, `People references linkableIdentities[${index}].displayName`),
      ...(optionalString(identity.email, `People references linkableIdentities[${index}].email`) ? {
        email: optionalString(identity.email, `People references linkableIdentities[${index}].email`),
      } : {}),
      roles: requireStringArray(identity.roles, `People references linkableIdentities[${index}].roles`),
    })),
  };
}

export async function loadPeopleReferences(
  institutionId: string,
): Promise<PeopleOperationReferences> {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return parseReferences(
    await requestWorkspaceJson(
      `/v1/people/institutions/${institutionId}/references`,
      {
        service: "People references service",
        maximumBytes,
        timeoutMs: 15_000,
      },
    ),
    institutionId,
  );
}
