import type {
  CanonicalTerminologyKey,
  ProgrammeHierarchyLevel,
  ResolvedInstitutionTerminology,
  TerminologyEntry,
  TerminologyVersion,
} from "@veza/contracts";
import {
  optionalInteger,
  optionalString,
  requireBoolean,
  requireInteger,
  requireOneOf,
  requireRecord,
  requireRecordArray,
  requireString,
} from "./json-contract";
import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 1024 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const canonicalKeys = [
  "learner", "staff", "guardian", "sponsor", "programme", "qualification",
  "learning-path", "subject", "module", "course", "grade", "year", "level",
  "cohort", "class", "academic-period", "outcome", "competency",
] as const satisfies readonly CanonicalTerminologyKey[];
const hierarchyTypes = [
  "programme", "qualification", "learning-path", "subject", "module", "course",
  "grade", "year", "level",
] as const;

async function request(path: string, init?: RequestInit): Promise<unknown> {
  return requestWorkspaceJson(path, {
    service: "Terminology service",
    maximumBytes,
    timeoutMs: 15_000,
    ...(init ? { init } : {}),
  });
}

function root(institutionId: string): string {
  if (!uuid.test(institutionId)) throw new Error("Institution identifier is invalid");
  return `/v1/institutions/${institutionId}/terminology`;
}

function parseEntry(value: unknown, label: string): TerminologyEntry {
  const entry = requireRecord(value, label);
  const shortLabel = optionalString(entry.shortLabel, `${label}.shortLabel`);
  const helpText = optionalString(entry.helpText, `${label}.helpText`);
  return {
    canonicalKey: requireOneOf(entry.canonicalKey, canonicalKeys, `${label}.canonicalKey`),
    singularLabel: requireString(entry.singularLabel, `${label}.singularLabel`),
    pluralLabel: requireString(entry.pluralLabel, `${label}.pluralLabel`),
    ...(shortLabel ? { shortLabel } : {}),
    ...(helpText ? { helpText } : {}),
  };
}

function parseHierarchyLevel(value: unknown, label: string): ProgrammeHierarchyLevel {
  const level = requireRecord(value, label);
  const maximumOccurrences = optionalInteger(level.maximumOccurrences, `${label}.maximumOccurrences`);
  return {
    levelOrder: requireInteger(level.levelOrder, `${label}.levelOrder`),
    canonicalType: requireOneOf(level.canonicalType, hierarchyTypes, `${label}.canonicalType`),
    singularLabel: requireString(level.singularLabel, `${label}.singularLabel`),
    pluralLabel: requireString(level.pluralLabel, `${label}.pluralLabel`),
    isRequired: requireBoolean(level.isRequired, `${label}.isRequired`),
    minimumOccurrences: requireInteger(level.minimumOccurrences, `${label}.minimumOccurrences`),
    ...(maximumOccurrences !== undefined ? { maximumOccurrences } : {}),
  };
}

function parseVersion(value: unknown, index: number, expectedInstitutionId: string): TerminologyVersion {
  const label = `Terminology versions[${index}]`;
  const version = requireRecord(value, label);
  const institutionId = requireString(version.institutionId, `${label}.institutionId`);
  if (institutionId !== expectedInstitutionId) {
    throw new Error("Terminology response crossed the requested institution boundary");
  }
  const description = optionalString(version.description, `${label}.description`);
  const effectiveFrom = optionalString(version.effectiveFrom, `${label}.effectiveFrom`);
  const effectiveUntil = optionalString(version.effectiveUntil, `${label}.effectiveUntil`);
  return {
    id: requireString(version.id, `${label}.id`),
    institutionId,
    locale: requireString(version.locale, `${label}.locale`),
    versionNumber: requireInteger(version.versionNumber, `${label}.versionNumber`),
    lifecycle: requireOneOf(version.lifecycle, ["draft", "in_review", "approved", "retired"] as const, `${label}.lifecycle`),
    title: requireString(version.title, `${label}.title`),
    ...(description ? { description } : {}),
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(effectiveUntil ? { effectiveUntil } : {}),
    version: requireInteger(version.version, `${label}.version`),
    entries: requireRecordArray(version.entries, `${label}.entries`).map((entry, entryIndex) =>
      parseEntry(entry, `${label}.entries[${entryIndex}]`),
    ),
    programmeHierarchy: requireRecordArray(version.programmeHierarchy, `${label}.programmeHierarchy`).map((level, levelIndex) =>
      parseHierarchyLevel(level, `${label}.programmeHierarchy[${levelIndex}]`),
    ),
  };
}

function parseLabels(value: unknown): ResolvedInstitutionTerminology["labels"] {
  const labels = requireRecord(value, "Resolved terminology.labels");
  const parsed: Partial<Record<CanonicalTerminologyKey, { singular: string; plural: string; short?: string }>> = {};
  for (const key of canonicalKeys) {
    const item = requireRecord(labels[key], `Resolved terminology.labels.${key}`);
    const short = optionalString(item.short, `Resolved terminology.labels.${key}.short`);
    parsed[key] = {
      singular: requireString(item.singular, `Resolved terminology.labels.${key}.singular`),
      plural: requireString(item.plural, `Resolved terminology.labels.${key}.plural`),
      ...(short ? { short } : {}),
    };
  }
  return parsed as ResolvedInstitutionTerminology["labels"];
}

export async function loadTerminologyVersions(
  institutionId: string,
): Promise<readonly TerminologyVersion[]> {
  const value = await request(root(institutionId));
  if (!Array.isArray(value)) throw new Error("Terminology versions did not match the API contract");
  return value.map((item, index) => parseVersion(item, index, institutionId));
}

export async function loadResolvedTerminology(
  institutionId: string,
  locale: string,
): Promise<ResolvedInstitutionTerminology> {
  const query = new URLSearchParams({ locale });
  const record = requireRecord(
    await request(`${root(institutionId)}/resolved?${query}`),
    "Resolved terminology",
  );
  const responseInstitutionId = requireString(record.institutionId, "Resolved terminology.institutionId");
  if (responseInstitutionId !== institutionId) {
    throw new Error("Resolved terminology crossed the requested institution boundary");
  }
  const terminologyVersionId = optionalString(record.terminologyVersionId, "Resolved terminology.terminologyVersionId");
  return {
    institutionId: responseInstitutionId,
    requestedLocale: requireString(record.requestedLocale, "Resolved terminology.requestedLocale"),
    resolvedLocale: requireString(record.resolvedLocale, "Resolved terminology.resolvedLocale"),
    ...(terminologyVersionId ? { terminologyVersionId } : {}),
    effectiveAt: requireString(record.effectiveAt, "Resolved terminology.effectiveAt"),
    labels: parseLabels(record.labels),
    programmeHierarchy: requireRecordArray(record.programmeHierarchy, "Resolved terminology.programmeHierarchy").map((level, index) =>
      parseHierarchyLevel(level, `Resolved terminology.programmeHierarchy[${index}]`),
    ),
  };
}

export function createTerminologyVersion(institutionId: string, input: unknown): Promise<unknown> {
  return request(root(institutionId), {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function transitionTerminologyVersion(
  institutionId: string,
  versionId: string,
  action: "submit" | "approve",
  input: unknown,
): Promise<unknown> {
  if (!uuid.test(versionId)) throw new Error("Terminology version identifier is invalid");
  return request(`${root(institutionId)}/${versionId}/${action}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
