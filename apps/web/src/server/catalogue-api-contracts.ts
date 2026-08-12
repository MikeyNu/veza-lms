import type {
  CatalogueReferences,
  CatalogueWorkspace,
  CourseBlueprintSummary,
  CourseRunSummary,
  CurriculumAnalysis,
  CurriculumHistory,
  CurriculumValidationIssue,
  EnrolmentSummary,
  LearningOutcomeSummary,
  ProgrammeVersionSummary,
} from "@veza/contracts";
import {
  optionalInteger,
  optionalNumber,
  optionalString,
  requireBoolean,
  requireInteger,
  requireOneOf,
  requireRecord,
  requireRecordArray,
  requireString,
  requireStringArray,
} from "./json-contract";

const curriculumLifecycles = ["draft", "in_review", "approved", "retired"] as const;
const programmeTypes = ["qualification", "learning-path", "short-course", "grade-band"] as const;
const definitionTypes = ["subject", "module", "course", "unit"] as const;
const deliveryModes = ["in_person", "online", "blended", "workplace"] as const;
const runLifecycles = ["draft", "scheduled", "open", "in_progress", "completed", "cancelled"] as const;
const enrolmentStatuses = ["pending", "active", "waitlisted", "withdrawn", "completed", "cancelled"] as const;

function sameInstitution(actual: string, expected: string, label: string): string {
  if (actual !== expected) throw new Error(`${label} crossed the requested institution boundary`);
  return actual;
}

function parseOutcome(value: unknown, index: number, institutionId: string): LearningOutcomeSummary {
  const label = `Catalogue workspace.outcomes[${index}]`;
  const item = requireRecord(value, label);
  const levelCode = optionalString(item.levelCode, `${label}.levelCode`);
  return {
    id: requireString(item.id, `${label}.id`),
    institutionId: sameInstitution(requireString(item.institutionId, `${label}.institutionId`), institutionId, label),
    code: requireString(item.code, `${label}.code`),
    title: requireString(item.title, `${label}.title`),
    outcomeType: requireOneOf(item.outcomeType, ["knowledge", "skill", "competency", "graduate-attribute"] as const, `${label}.outcomeType`),
    ...(levelCode ? { levelCode } : {}),
    status: requireOneOf(item.status, ["active", "retired"] as const, `${label}.status`),
    version: requireInteger(item.version, `${label}.version`),
  };
}

function parseProgramme(value: unknown, index: number, institutionId: string): ProgrammeVersionSummary {
  const label = `Catalogue workspace.programmes[${index}]`;
  const item = requireRecord(value, label);
  const creditValue = optionalNumber(item.creditValue, `${label}.creditValue`);
  const notionalHours = optionalNumber(item.notionalHours, `${label}.notionalHours`);
  const durationValue = optionalNumber(item.durationValue, `${label}.durationValue`);
  const durationUnit = item.durationUnit === undefined || item.durationUnit === null
    ? undefined
    : requireOneOf(item.durationUnit, ["days", "weeks", "months", "years"] as const, `${label}.durationUnit`);
  const effectiveFrom = optionalString(item.effectiveFrom, `${label}.effectiveFrom`);
  const effectiveUntil = optionalString(item.effectiveUntil, `${label}.effectiveUntil`);
  const submittedAt = optionalString(item.submittedAt, `${label}.submittedAt`);
  const approvedAt = optionalString(item.approvedAt, `${label}.approvedAt`);
  const approvalReviewId = optionalString(item.approvalReviewId, `${label}.approvalReviewId`);
  return {
    id: requireString(item.id, `${label}.id`),
    programmeId: requireString(item.programmeId, `${label}.programmeId`),
    institutionId: sameInstitution(requireString(item.institutionId, `${label}.institutionId`), institutionId, label),
    code: requireString(item.code, `${label}.code`),
    title: requireString(item.title, `${label}.title`),
    programmeType: requireOneOf(item.programmeType, programmeTypes, `${label}.programmeType`),
    versionNumber: requireInteger(item.versionNumber, `${label}.versionNumber`),
    lifecycle: requireOneOf(item.lifecycle, curriculumLifecycles, `${label}.lifecycle`),
    ...(creditValue !== undefined ? { creditValue } : {}),
    ...(notionalHours !== undefined ? { notionalHours } : {}),
    ...(durationValue !== undefined ? { durationValue } : {}),
    ...(durationUnit ? { durationUnit } : {}),
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(effectiveUntil ? { effectiveUntil } : {}),
    ...(submittedAt ? { submittedAt } : {}),
    ...(approvedAt ? { approvedAt } : {}),
    ...(approvalReviewId ? { approvalReviewId } : {}),
    courseCount: requireInteger(item.courseCount, `${label}.courseCount`),
    version: requireInteger(item.version, `${label}.version`),
  };
}

function parseBlueprint(value: unknown, index: number, institutionId: string): CourseBlueprintSummary {
  const label = `Catalogue workspace.blueprints[${index}]`;
  const item = requireRecord(value, label);
  const parentDefinitionId = optionalString(item.parentDefinitionId, `${label}.parentDefinitionId`);
  const subjectArea = optionalString(item.subjectArea, `${label}.subjectArea`);
  const creditValue = optionalNumber(item.creditValue, `${label}.creditValue`);
  const notionalHours = optionalNumber(item.notionalHours, `${label}.notionalHours`);
  const effectiveFrom = optionalString(item.effectiveFrom, `${label}.effectiveFrom`);
  const effectiveUntil = optionalString(item.effectiveUntil, `${label}.effectiveUntil`);
  const submittedAt = optionalString(item.submittedAt, `${label}.submittedAt`);
  const approvedAt = optionalString(item.approvedAt, `${label}.approvedAt`);
  const approvalReviewId = optionalString(item.approvalReviewId, `${label}.approvalReviewId`);
  return {
    id: requireString(item.id, `${label}.id`),
    courseDefinitionId: requireString(item.courseDefinitionId, `${label}.courseDefinitionId`),
    ...(parentDefinitionId ? { parentDefinitionId } : {}),
    institutionId: sameInstitution(requireString(item.institutionId, `${label}.institutionId`), institutionId, label),
    code: requireString(item.code, `${label}.code`),
    title: requireString(item.title, `${label}.title`),
    definitionType: requireOneOf(item.definitionType, definitionTypes, `${label}.definitionType`),
    ...(subjectArea ? { subjectArea } : {}),
    versionNumber: requireInteger(item.versionNumber, `${label}.versionNumber`),
    lifecycle: requireOneOf(item.lifecycle, curriculumLifecycles, `${label}.lifecycle`),
    ...(creditValue !== undefined ? { creditValue } : {}),
    ...(notionalHours !== undefined ? { notionalHours } : {}),
    deliveryModes: requireStringArray(item.deliveryModes, `${label}.deliveryModes`).map((mode, modeIndex) =>
      requireOneOf(mode, deliveryModes, `${label}.deliveryModes[${modeIndex}]`),
    ),
    ...(effectiveFrom ? { effectiveFrom } : {}),
    ...(effectiveUntil ? { effectiveUntil } : {}),
    ...(submittedAt ? { submittedAt } : {}),
    ...(approvedAt ? { approvedAt } : {}),
    ...(approvalReviewId ? { approvalReviewId } : {}),
    outcomeCount: requireInteger(item.outcomeCount, `${label}.outcomeCount`),
    requisiteCount: requireInteger(item.requisiteCount, `${label}.requisiteCount`),
    version: requireInteger(item.version, `${label}.version`),
  };
}

function parseRun(value: unknown, index: number, institutionId: string): CourseRunSummary {
  const label = `Catalogue workspace.runs[${index}]`;
  const item = requireRecord(value, label);
  const capacity = optionalInteger(item.capacity, `${label}.capacity`);
  return {
    id: requireString(item.id, `${label}.id`),
    institutionId: sameInstitution(requireString(item.institutionId, `${label}.institutionId`), institutionId, label),
    academicPeriodId: requireString(item.academicPeriodId, `${label}.academicPeriodId`),
    blueprintVersionId: requireString(item.blueprintVersionId, `${label}.blueprintVersionId`),
    code: requireString(item.code, `${label}.code`),
    title: requireString(item.title, `${label}.title`),
    deliveryMode: requireOneOf(item.deliveryMode, deliveryModes, `${label}.deliveryMode`),
    startsOn: requireString(item.startsOn, `${label}.startsOn`),
    endsOn: requireString(item.endsOn, `${label}.endsOn`),
    ...(capacity !== undefined ? { capacity } : {}),
    lifecycle: requireOneOf(item.lifecycle, runLifecycles, `${label}.lifecycle`),
    classCount: requireInteger(item.classCount, `${label}.classCount`),
    activeEnrolmentCount: requireInteger(item.activeEnrolmentCount, `${label}.activeEnrolmentCount`),
    version: requireInteger(item.version, `${label}.version`),
  };
}

function parseEnrolment(value: unknown, index: number, institutionId: string): EnrolmentSummary {
  const label = `Catalogue workspace.enrolments[${index}]`;
  const item = requireRecord(value, label);
  const classSectionId = optionalString(item.classSectionId, `${label}.classSectionId`);
  const cohortId = optionalString(item.cohortId, `${label}.cohortId`);
  const effectiveUntil = optionalString(item.effectiveUntil, `${label}.effectiveUntil`);
  return {
    id: requireString(item.id, `${label}.id`),
    institutionId: sameInstitution(requireString(item.institutionId, `${label}.institutionId`), institutionId, label),
    learnerPersonId: requireString(item.learnerPersonId, `${label}.learnerPersonId`),
    learnerDisplayName: requireString(item.learnerDisplayName, `${label}.learnerDisplayName`),
    courseRunId: requireString(item.courseRunId, `${label}.courseRunId`),
    courseRunTitle: requireString(item.courseRunTitle, `${label}.courseRunTitle`),
    ...(classSectionId ? { classSectionId } : {}),
    ...(cohortId ? { cohortId } : {}),
    status: requireOneOf(item.status, enrolmentStatuses, `${label}.status`),
    enrolledOn: requireString(item.enrolledOn, `${label}.enrolledOn`),
    effectiveFrom: requireString(item.effectiveFrom, `${label}.effectiveFrom`),
    ...(effectiveUntil ? { effectiveUntil } : {}),
    version: requireInteger(item.version, `${label}.version`),
  };
}

export function parseCatalogueWorkspace(value: unknown, institutionId: string): CatalogueWorkspace {
  const record = requireRecord(value, "Catalogue workspace");
  sameInstitution(requireString(record.institutionId, "Catalogue workspace.institutionId"), institutionId, "Catalogue workspace");
  return {
    institutionId,
    programmes: requireRecordArray(record.programmes, "Catalogue workspace.programmes").map((item, index) => parseProgramme(item, index, institutionId)),
    blueprints: requireRecordArray(record.blueprints, "Catalogue workspace.blueprints").map((item, index) => parseBlueprint(item, index, institutionId)),
    outcomes: requireRecordArray(record.outcomes, "Catalogue workspace.outcomes").map((item, index) => parseOutcome(item, index, institutionId)),
    runs: requireRecordArray(record.runs, "Catalogue workspace.runs").map((item, index) => parseRun(item, index, institutionId)),
    enrolments: requireRecordArray(record.enrolments, "Catalogue workspace.enrolments").map((item, index) => parseEnrolment(item, index, institutionId)),
  };
}

export function parseCatalogueReferences(value: unknown): CatalogueReferences {
  const record = requireRecord(value, "Catalogue references");
  return {
    academicPeriods: requireRecordArray(record.academicPeriods, "Catalogue references.academicPeriods").map((item, index) => ({
      id: requireString(item.id, `Catalogue references.academicPeriods[${index}].id`),
      code: requireString(item.code, `Catalogue references.academicPeriods[${index}].code`),
      title: requireString(item.title, `Catalogue references.academicPeriods[${index}].title`),
      startsOn: requireString(item.startsOn, `Catalogue references.academicPeriods[${index}].startsOn`),
      endsOn: requireString(item.endsOn, `Catalogue references.academicPeriods[${index}].endsOn`),
    })),
    eligibleLearners: requireRecordArray(record.eligibleLearners, "Catalogue references.eligibleLearners").map((item, index) => ({
      id: requireString(item.id, `Catalogue references.eligibleLearners[${index}].id`),
      displayName: requireString(item.displayName, `Catalogue references.eligibleLearners[${index}].displayName`),
      learnerStatus: requireString(item.learnerStatus, `Catalogue references.eligibleLearners[${index}].learnerStatus`),
    })),
    eligibleStaff: requireRecordArray(record.eligibleStaff, "Catalogue references.eligibleStaff").map((item, index) => {
      const employeeNumber = optionalString(item.employeeNumber, `Catalogue references.eligibleStaff[${index}].employeeNumber`);
      return {
        id: requireString(item.id, `Catalogue references.eligibleStaff[${index}].id`),
        displayName: requireString(item.displayName, `Catalogue references.eligibleStaff[${index}].displayName`),
        staffStatus: requireString(item.staffStatus, `Catalogue references.eligibleStaff[${index}].staffStatus`),
        ...(employeeNumber ? { employeeNumber } : {}),
      };
    }),
    cohorts: requireRecordArray(record.cohorts, "Catalogue references.cohorts").map((item, index) => ({
      id: requireString(item.id, `Catalogue references.cohorts[${index}].id`),
      code: requireString(item.code, `Catalogue references.cohorts[${index}].code`),
      title: requireString(item.title, `Catalogue references.cohorts[${index}].title`),
      status: requireString(item.status, `Catalogue references.cohorts[${index}].status`),
    })),
    classes: requireRecordArray(record.classes, "Catalogue references.classes").map((item, index) => {
      const cohortId = optionalString(item.cohortId, `Catalogue references.classes[${index}].cohortId`);
      return {
        id: requireString(item.id, `Catalogue references.classes[${index}].id`),
        courseRunId: requireString(item.courseRunId, `Catalogue references.classes[${index}].courseRunId`),
        ...(cohortId ? { cohortId } : {}),
        code: requireString(item.code, `Catalogue references.classes[${index}].code`),
        title: requireString(item.title, `Catalogue references.classes[${index}].title`),
        status: requireString(item.status, `Catalogue references.classes[${index}].status`),
        version: requireInteger(item.version, `Catalogue references.classes[${index}].version`),
      };
    }),
  };
}

function parseIssue(value: unknown, label: string): CurriculumValidationIssue {
  const issue = requireRecord(value, label);
  const field = optionalString(issue.field, `${label}.field`);
  return {
    code: requireString(issue.code, `${label}.code`),
    severity: requireOneOf(issue.severity, ["error", "warning"] as const, `${label}.severity`),
    ...(field ? { field } : {}),
    message: requireString(issue.message, `${label}.message`),
    ...(issue.actual !== undefined ? { actual: issue.actual } : {}),
    ...(issue.expected !== undefined ? { expected: issue.expected } : {}),
  };
}

export function parseCurriculumAnalysis(value: unknown): CurriculumAnalysis {
  const record = requireRecord(value, "Curriculum analysis");
  const validation = requireRecord(record.validation, "Curriculum analysis.validation");
  const policyVersionId = optionalString(validation.policyVersionId, "Curriculum analysis.validation.policyVersionId");
  return {
    reviewId: requireString(record.reviewId, "Curriculum analysis.reviewId"),
    resourceType: requireOneOf(record.resourceType, ["programme-version", "course-blueprint-version"] as const, "Curriculum analysis.resourceType"),
    resourceId: requireString(record.resourceId, "Curriculum analysis.resourceId"),
    resourceVersion: requireInteger(record.resourceVersion, "Curriculum analysis.resourceVersion"),
    validation: {
      passed: requireBoolean(validation.passed, "Curriculum analysis.validation.passed"),
      errors: requireRecordArray(validation.errors, "Curriculum analysis.validation.errors").map((issue, index) => parseIssue(issue, `Curriculum analysis.validation.errors[${index}]`)),
      warnings: requireRecordArray(validation.warnings, "Curriculum analysis.validation.warnings").map((issue, index) => parseIssue(issue, `Curriculum analysis.validation.warnings[${index}]`)),
      ...(policyVersionId ? { policyVersionId } : {}),
    },
    outcomeCoverage: requireRecord(record.outcomeCoverage, "Curriculum analysis.outcomeCoverage"),
    impact: requireRecord(record.impact, "Curriculum analysis.impact"),
  };
}

export function parseCurriculumHistory(value: unknown): CurriculumHistory {
  const record = requireRecord(value, "Curriculum history");
  return {
    resourceType: requireOneOf(record.resourceType, ["programme-version", "course-blueprint-version"] as const, "Curriculum history.resourceType"),
    aggregateId: requireString(record.aggregateId, "Curriculum history.aggregateId"),
    versions: requireRecordArray(record.versions, "Curriculum history.versions"),
    reviews: requireRecordArray(record.reviews, "Curriculum history.reviews"),
    auditEvents: requireRecordArray(record.auditEvents, "Curriculum history.auditEvents"),
  };
}

export function parseCurriculumSubmission(value: unknown): {
  id: string;
  lifecycle: "in_review";
  reviewId: string;
  version: number;
  validation: CurriculumAnalysis["validation"];
} {
  const record = requireRecord(value, "Curriculum submission");
  const analysis = parseCurriculumAnalysis({
    reviewId: record.reviewId,
    resourceType: "programme-version",
    resourceId: record.id,
    resourceVersion: record.version,
    validation: record.validation,
    outcomeCoverage: {},
    impact: {},
  });
  return {
    id: requireString(record.id, "Curriculum submission.id"),
    lifecycle: requireOneOf(record.lifecycle, ["in_review"] as const, "Curriculum submission.lifecycle"),
    reviewId: analysis.reviewId,
    version: requireInteger(record.version, "Curriculum submission.version"),
    validation: analysis.validation,
  };
}
