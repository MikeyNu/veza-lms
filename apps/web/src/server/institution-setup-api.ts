import { cookies } from "next/headers";
import type {
  AcademicPeriodStatus,
  AcademicPeriodType,
  ActivationCheck,
  CampusDeliveryMode,
  CampusStatus,
  InstitutionId,
  InstitutionStatus,
  InstitutionType,
  InstitutionalPolicyKey,
  InstitutionalPolicyStatus,
  OrganisationalUnitType,
  TenantActivationReadiness,
  TenantStatus,
} from "@veza/contracts";
import { membershipCookieName } from "./auth-config";
import { getWebOidcSession } from "./web-session";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const tenantStatuses = new Set<TenantStatus>(["provisioning", "active", "suspended", "offboarding", "closed"]);
const institutionStatuses = new Set<InstitutionStatus>(["draft", "active", "archived"]);
const institutionTypes = new Set<InstitutionType>(["school", "college", "university", "training-provider", "corporate-academy", "other"]);
const campusStatuses = new Set<CampusStatus>(["draft", "active", "archived"]);
const deliveryModes = new Set<CampusDeliveryMode>(["physical", "virtual", "hybrid"]);
const periodStatuses = new Set<AcademicPeriodStatus>(["draft", "published", "closed", "archived"]);
const periodTypes = new Set<AcademicPeriodType>(["academic-year", "semester", "trimester", "term", "quarter", "block", "custom"]);
const policyStatuses = new Set<InstitutionalPolicyStatus>(["draft", "approved", "retired"]);
const policyKeys = new Set<InstitutionalPolicyKey>(["privacy", "data-retention", "acceptable-use", "academic-integrity", "assessment", "attendance", "safeguarding", "support-escalation", "communications"]);
const maximumResponseBytes = 512 * 1024;

export interface SetupProfile {
  readonly identityMode: "managed" | "sso" | "hybrid";
  readonly supportEmail: string;
  readonly privacyContactEmail: string;
  readonly dataRetentionDays: number;
  readonly learnerSupportSlaHours: number;
}

export interface InstitutionSummary {
  readonly id: InstitutionId;
  readonly code: string;
  readonly displayName: string;
  readonly institutionType: InstitutionType;
  readonly status: InstitutionStatus;
  readonly activeCampuses: number;
  readonly activeUnits: number;
  readonly publishedPeriods: number;
  readonly approvedPolicies: readonly InstitutionalPolicyKey[];
}

export interface InstitutionDetail {
  readonly institution: {
    readonly id: InstitutionId;
    readonly code: string;
    readonly displayName: string;
    readonly legalName?: string;
    readonly institutionType: InstitutionType;
    readonly status: InstitutionStatus;
    readonly locale: string;
    readonly timezone: string;
    readonly contactEmail?: string;
  };
  readonly campuses: readonly {
    readonly id: string;
    readonly code: string;
    readonly displayName: string;
    readonly deliveryMode: CampusDeliveryMode;
    readonly status: CampusStatus;
    readonly isPrimary: boolean;
    readonly timezone: string;
  }[];
  readonly organisationalUnits: readonly {
    readonly id: string;
    readonly parentUnitId?: string;
    readonly code: string;
    readonly displayName: string;
    readonly unitType: OrganisationalUnitType;
    readonly status: "active" | "archived";
  }[];
  readonly academicPeriods: readonly {
    readonly id: string;
    readonly parentPeriodId?: string;
    readonly code: string;
    readonly displayName: string;
    readonly periodType: AcademicPeriodType;
    readonly status: AcademicPeriodStatus;
    readonly startsOn: string;
    readonly endsOn: string;
    readonly timezone: string;
  }[];
  readonly policies: readonly {
    readonly id: string;
    readonly policyKey: InstitutionalPolicyKey;
    readonly version: number;
    readonly status: InstitutionalPolicyStatus;
    readonly title: string;
    readonly effectiveFrom?: string;
    readonly effectiveUntil?: string;
  }[];
}

export interface InstitutionSetupBundle {
  readonly profile: SetupProfile | null;
  readonly institutions: readonly InstitutionSummary[];
  readonly selectedInstitution: InstitutionDetail | null;
  readonly readiness: TenantActivationReadiness | null;
}

export class InstitutionSetupApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function string(value: unknown): value is string { return typeof value === "string" && value.length > 0; }
function uuid(value: unknown): value is string { return typeof value === "string" && uuidPattern.test(value); }
function integer(value: unknown): value is number { return typeof value === "number" && Number.isInteger(value); }
function optionalString(value: unknown): value is string | undefined { return value === undefined || typeof value === "string"; }
function apiBaseUrl(): string { return process.env.VEZA_API_BASE_URL ?? "http://localhost:4000"; }

async function credentials(): Promise<{ readonly accessToken: string; readonly membershipId: string }> {
  const [session, cookieStore] = await Promise.all([getWebOidcSession(), cookies()]);
  const membershipId = cookieStore.get(membershipCookieName)?.value;
  if (!session || !membershipId || !uuid(membershipId)) throw new InstitutionSetupApiError(401, "An active workspace session is required");
  return { accessToken: session.accessToken, membershipId };
}

async function getJson(path: string): Promise<unknown> {
  const auth = await credentials();
  const response = await fetch(`${apiBaseUrl()}/v1/institution-setup${path}`, {
    headers: { authorization: `Bearer ${auth.accessToken}`, "x-veza-membership-id": auth.membershipId },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  if (text.length > maximumResponseBytes) throw new InstitutionSetupApiError(502, "Institution setup response is unexpectedly large");
  let payload: unknown;
  try { payload = JSON.parse(text) as unknown; } catch { throw new InstitutionSetupApiError(502, "Institution setup returned invalid JSON"); }
  if (!response.ok) throw new InstitutionSetupApiError(response.status, "Institution setup data could not be loaded");
  return payload;
}

function profile(value: unknown): SetupProfile | null {
  if (value === null) return null;
  if (!isRecord(value) || !["managed", "sso", "hybrid"].includes(String(value.identity_mode))) throw new InstitutionSetupApiError(502, "Setup profile did not match the API contract");
  if (!string(value.support_email) || !string(value.privacy_contact_email) || !integer(value.data_retention_days) || !integer(value.learner_support_sla_hours)) throw new InstitutionSetupApiError(502, "Setup profile did not match the API contract");
  return { identityMode: value.identity_mode as SetupProfile["identityMode"], supportEmail: String(value.support_email), privacyContactEmail: String(value.privacy_contact_email), dataRetentionDays: Number(value.data_retention_days), learnerSupportSlaHours: Number(value.learner_support_sla_hours) };
}

function summary(value: unknown): InstitutionSummary {
  if (!isRecord(value) || !uuid(value.id) || !string(value.code) || !string(value.display_name)) throw new InstitutionSetupApiError(502, "Institution summary did not match the API contract");
  if (!institutionTypes.has(value.institution_type as InstitutionType) || !institutionStatuses.has(value.status as InstitutionStatus)) throw new InstitutionSetupApiError(502, "Institution summary contained an unknown state");
  if (![value.active_campuses, value.active_units, value.published_periods].every(integer) || !Array.isArray(value.approved_policies) || !value.approved_policies.every((item) => policyKeys.has(item as InstitutionalPolicyKey))) throw new InstitutionSetupApiError(502, "Institution summary counts did not match the API contract");
  return { id: value.id as InstitutionId, code: String(value.code), displayName: String(value.display_name), institutionType: value.institution_type as InstitutionType, status: value.status as InstitutionStatus, activeCampuses: Number(value.active_campuses), activeUnits: Number(value.active_units), publishedPeriods: Number(value.published_periods), approvedPolicies: value.approved_policies as InstitutionalPolicyKey[] };
}

function readiness(value: unknown): TenantActivationReadiness {
  if (!isRecord(value) || !uuid(value.tenantId) || !tenantStatuses.has(value.tenantStatus as TenantStatus) || typeof value.ready !== "boolean" || !string(value.evaluatedAt) || !Number.isFinite(Date.parse(value.evaluatedAt)) || !Array.isArray(value.checks)) throw new InstitutionSetupApiError(502, "Activation readiness did not match the API contract");
  const checks: ActivationCheck[] = value.checks.map((item) => {
    if (!isRecord(item) || !string(item.key) || !string(item.label) || typeof item.passed !== "boolean" || typeof item.blocking !== "boolean" || !string(item.detail) || (item.institutionId !== undefined && !uuid(item.institutionId))) throw new InstitutionSetupApiError(502, "Activation check did not match the API contract");
    return { key: String(item.key), label: String(item.label), passed: Boolean(item.passed), blocking: Boolean(item.blocking), detail: String(item.detail), ...(item.institutionId ? { institutionId: item.institutionId as InstitutionId } : {}) };
  });
  return { tenantId: value.tenantId as TenantActivationReadiness["tenantId"], tenantStatus: value.tenantStatus as TenantStatus, ready: Boolean(value.ready), checks, evaluatedAt: String(value.evaluatedAt) };
}

function detail(value: unknown): InstitutionDetail {
  if (!isRecord(value) || !isRecord(value.institution) || !Array.isArray(value.campuses) || !Array.isArray(value.organisationalUnits) || !Array.isArray(value.academicPeriods) || !Array.isArray(value.policies)) throw new InstitutionSetupApiError(502, "Institution detail did not match the API contract");
  const institution = value.institution;
  if (!uuid(institution.id) || !string(institution.code) || !string(institution.display_name) || !institutionTypes.has(institution.institution_type as InstitutionType) || !institutionStatuses.has(institution.status as InstitutionStatus) || !string(institution.locale) || !string(institution.timezone) || !optionalString(institution.legal_name) || !optionalString(institution.contact_email)) throw new InstitutionSetupApiError(502, "Institution detail contained an invalid institution");
  const campuses = value.campuses.map((item) => {
    if (!isRecord(item) || !uuid(item.id) || !string(item.code) || !string(item.display_name) || !deliveryModes.has(item.delivery_mode as CampusDeliveryMode) || !campusStatuses.has(item.status as CampusStatus) || typeof item.is_primary !== "boolean" || !string(item.timezone)) throw new InstitutionSetupApiError(502, "Campus detail did not match the API contract");
    return { id: String(item.id), code: String(item.code), displayName: String(item.display_name), deliveryMode: item.delivery_mode as CampusDeliveryMode, status: item.status as CampusStatus, isPrimary: Boolean(item.is_primary), timezone: String(item.timezone) };
  });
  const organisationalUnits = value.organisationalUnits.map((item) => {
    if (!isRecord(item) || !uuid(item.id) || !string(item.code) || !string(item.display_name) || !["faculty", "school", "department", "division", "centre", "programme-office", "other"].includes(String(item.unit_type)) || !["active", "archived"].includes(String(item.status)) || (item.parent_unit_id !== null && item.parent_unit_id !== undefined && !uuid(item.parent_unit_id))) throw new InstitutionSetupApiError(502, "Organisational unit did not match the API contract");
    return { id: String(item.id), code: String(item.code), displayName: String(item.display_name), unitType: item.unit_type as OrganisationalUnitType, status: item.status as "active" | "archived", ...(item.parent_unit_id ? { parentUnitId: item.parent_unit_id } : {}) };
  });
  const academicPeriods = value.academicPeriods.map((item) => {
    if (!isRecord(item) || !uuid(item.id) || !string(item.code) || !string(item.display_name) || !periodTypes.has(item.period_type as AcademicPeriodType) || !periodStatuses.has(item.status as AcademicPeriodStatus) || !string(item.starts_on) || !string(item.ends_on) || !string(item.timezone) || (item.parent_period_id !== null && item.parent_period_id !== undefined && !uuid(item.parent_period_id))) throw new InstitutionSetupApiError(502, "Academic period did not match the API contract");
    return { id: String(item.id), code: String(item.code), displayName: String(item.display_name), periodType: item.period_type as AcademicPeriodType, status: item.status as AcademicPeriodStatus, startsOn: String(item.starts_on), endsOn: String(item.ends_on), timezone: String(item.timezone), ...(item.parent_period_id ? { parentPeriodId: item.parent_period_id } : {}) };
  });
  const policies = value.policies.map((item) => {
    if (!isRecord(item) || !uuid(item.id) || !policyKeys.has(item.policy_key as InstitutionalPolicyKey) || !integer(item.version) || !policyStatuses.has(item.status as InstitutionalPolicyStatus) || !string(item.title) || !optionalString(item.effective_from) || !optionalString(item.effective_until)) throw new InstitutionSetupApiError(502, "Policy summary did not match the API contract");
    return { id: String(item.id), policyKey: item.policy_key as InstitutionalPolicyKey, version: Number(item.version), status: item.status as InstitutionalPolicyStatus, title: String(item.title), ...(item.effective_from ? { effectiveFrom: String(item.effective_from) } : {}), ...(item.effective_until ? { effectiveUntil: String(item.effective_until) } : {}) };
  });
  return { institution: { id: institution.id as InstitutionId, code: String(institution.code), displayName: String(institution.display_name), institutionType: institution.institution_type as InstitutionType, status: institution.status as InstitutionStatus, locale: String(institution.locale), timezone: String(institution.timezone), ...(institution.legal_name ? { legalName: String(institution.legal_name) } : {}), ...(institution.contact_email ? { contactEmail: String(institution.contact_email) } : {}) }, campuses, organisationalUnits, academicPeriods, policies };
}

export async function loadTenantSetupBundle(selectedInstitutionId?: InstitutionId): Promise<InstitutionSetupBundle> {
  const [overviewValue, readinessValue] = await Promise.all([getJson(""), getJson("/activation-readiness")]);
  if (!isRecord(overviewValue) || !Array.isArray(overviewValue.institutions)) throw new InstitutionSetupApiError(502, "Institution setup overview did not match the API contract");
  const institutions = overviewValue.institutions.map(summary);
  const selectedId = selectedInstitutionId && institutions.some((item) => item.id === selectedInstitutionId) ? selectedInstitutionId : institutions[0]?.id;
  return { profile: profile(overviewValue.profile), institutions, selectedInstitution: selectedId ? detail(await getJson(`/institutions/${selectedId}`)) : null, readiness: readiness(readinessValue) };
}

export async function loadScopedInstitution(institutionId: InstitutionId): Promise<InstitutionSetupBundle> {
  return { profile: null, institutions: [], selectedInstitution: detail(await getJson(`/institutions/${institutionId}`)), readiness: null };
}
