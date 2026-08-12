import type {
  AnalyticsMetric,
  GradebookSummary,
  LearnerCourseRoom,
  LearnerHome,
  StudioAssetRecord,
  StudioBlock,
  StudioBlockType,
  StudioCommentRecord,
  StudioCourseSpaceSummary,
  StudioImportReportRecord,
  StudioLessonDetail,
  StudioLessonRecord,
  StudioLibrary,
  StudioModuleRecord,
  StudioPublicationRecord,
  StudioReusableBlockRecord,
  StudioRevisionRecord,
  StudioReviewRecord,
  StudioValidationReport,
  StudioWorkspace,
} from "@veza/contracts";
import {
  optionalInteger,
  optionalNumber,
  optionalRecordArray,
  optionalString,
  requireBoolean,
  requireInteger,
  requireNumber,
  requireOneOf,
  requireRecord,
  requireRecordArray,
  requireString,
  type JsonRecord,
} from "./json-contract";

const studioBlockTypes = [
  "heading", "paragraph", "callout", "quote", "image", "video", "audio", "file",
  "embed", "table", "columns", "accordion", "tabs", "divider", "code", "equation",
  "quiz", "activity", "outcome",
] as const satisfies readonly StudioBlockType[];

function optionalRecord(value: unknown, label: string): JsonRecord | undefined {
  return value === undefined || value === null ? undefined : requireRecord(value, label);
}

function sameInstitution(actual: string, expected: string, label: string): string {
  if (actual !== expected) throw new Error(`${label} crossed the requested institution boundary`);
  return actual;
}

function parseBlock(value: unknown, label: string): StudioBlock {
  const block = requireRecord(value, label);
  const children = block.children === undefined || block.children === null
    ? undefined
    : requireRecordArray(block.children, `${label}.children`).map((child, index) =>
        parseBlock(child, `${label}.children[${index}]`),
      );
  return {
    id: requireString(block.id, `${label}.id`),
    type: requireOneOf(block.type, studioBlockTypes, `${label}.type`),
    data: requireRecord(block.data, `${label}.data`),
    ...(children ? { children } : {}),
  };
}

function parseValidationReport(value: unknown, label: string): StudioValidationReport {
  const report = requireRecord(value, label);
  return {
    passed: requireBoolean(report.passed, `${label}.passed`),
    findings: requireRecordArray(report.findings, `${label}.findings`).map((finding, index) => {
      const findingLabel = `${label}.findings[${index}]`;
      const blockId = optionalString(finding.blockId, `${findingLabel}.blockId`);
      return {
        code: requireString(finding.code, `${findingLabel}.code`),
        severity: requireOneOf(finding.severity, ["error", "warning"] as const, `${findingLabel}.severity`),
        ...(blockId ? { blockId } : {}),
        message: requireString(finding.message, `${findingLabel}.message`),
      };
    }),
    checkedAt: requireString(report.checkedAt, `${label}.checkedAt`),
  };
}

function parseCourseSpace(value: unknown, label: string, institutionId: string): StudioCourseSpaceSummary {
  const item = requireRecord(value, label);
  const currentPublicationId = optionalString(item.currentPublicationId, `${label}.currentPublicationId`);
  return {
    id: requireString(item.id, `${label}.id`),
    institutionId: sameInstitution(requireString(item.institutionId, `${label}.institutionId`), institutionId, label),
    blueprintVersionId: requireString(item.blueprintVersionId, `${label}.blueprintVersionId`),
    title: requireString(item.title, `${label}.title`),
    status: requireOneOf(item.status, ["draft", "in_review", "published", "retired"] as const, `${label}.status`),
    moduleCount: requireInteger(item.moduleCount, `${label}.moduleCount`),
    lessonCount: requireInteger(item.lessonCount, `${label}.lessonCount`),
    ...(currentPublicationId ? { currentPublicationId } : {}),
    version: requireInteger(item.version, `${label}.version`),
  };
}

function parseModule(value: unknown, label: string): StudioModuleRecord {
  const item = requireRecord(value, label);
  const description = optionalString(item.description, `${label}.description`);
  return {
    id: requireString(item.id, `${label}.id`),
    courseSpaceId: requireString(item.courseSpaceId, `${label}.courseSpaceId`),
    title: requireString(item.title, `${label}.title`),
    ...(description ? { description } : {}),
    sequenceNumber: requireInteger(item.sequenceNumber, `${label}.sequenceNumber`),
    availabilityRule: requireRecord(item.availabilityRule, `${label}.availabilityRule`),
    completionRule: requireRecord(item.completionRule, `${label}.completionRule`),
    status: requireOneOf(item.status, ["draft", "active", "retired"] as const, `${label}.status`),
    version: requireInteger(item.version, `${label}.version`),
  };
}

function parseLesson(value: unknown, label: string): StudioLessonRecord {
  const item = requireRecord(value, label);
  const summary = optionalString(item.summary, `${label}.summary`);
  const estimatedMinutes = optionalInteger(item.estimatedMinutes, `${label}.estimatedMinutes`);
  const currentRevisionId = optionalString(item.currentRevisionId, `${label}.currentRevisionId`);
  return {
    id: requireString(item.id, `${label}.id`),
    courseSpaceId: requireString(item.courseSpaceId, `${label}.courseSpaceId`),
    moduleId: requireString(item.moduleId, `${label}.moduleId`),
    title: requireString(item.title, `${label}.title`),
    ...(summary ? { summary } : {}),
    sequenceNumber: requireInteger(item.sequenceNumber, `${label}.sequenceNumber`),
    lessonType: requireOneOf(item.lessonType, ["lesson", "resource", "activity", "discussion", "assignment-link"] as const, `${label}.lessonType`),
    ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
    availabilityRule: requireRecord(item.availabilityRule, `${label}.availabilityRule`),
    completionRule: requireRecord(item.completionRule, `${label}.completionRule`),
    status: requireOneOf(item.status, ["draft", "in_review", "published", "retired"] as const, `${label}.status`),
    ...(currentRevisionId ? { currentRevisionId } : {}),
    version: requireInteger(item.version, `${label}.version`),
  };
}

function parseNumberRecord(value: unknown, label: string): Readonly<Record<string, number>> {
  const record = requireRecord(value, label);
  return Object.fromEntries(
    Object.entries(record).map(([key, item]) => [key, requireNumber(item, `${label}.${key}`)]),
  );
}

function parseRevision(value: unknown, label: string): StudioRevisionRecord {
  const item = requireRecord(value, label);
  const basedOnRevisionId = optionalString(item.basedOnRevisionId, `${label}.basedOnRevisionId`);
  return {
    id: requireString(item.id, `${label}.id`),
    lessonId: requireString(item.lessonId, `${label}.lessonId`),
    revisionNumber: requireInteger(item.revisionNumber, `${label}.revisionNumber`),
    ...(basedOnRevisionId ? { basedOnRevisionId } : {}),
    blocks: requireRecordArray(item.blocks, `${label}.blocks`).map((block, index) => parseBlock(block, `${label}.blocks[${index}]`)),
    checksumSha256: requireString(item.checksumSha256, `${label}.checksumSha256`),
    changeSummary: requireString(item.changeSummary, `${label}.changeSummary`),
    accessibilityReport: parseValidationReport(item.accessibilityReport, `${label}.accessibilityReport`),
    linkReport: parseValidationReport(item.linkReport, `${label}.linkReport`),
    readingMetrics: parseNumberRecord(item.readingMetrics, `${label}.readingMetrics`),
    createdBy: requireString(item.createdBy, `${label}.createdBy`),
    createdAt: requireString(item.createdAt, `${label}.createdAt`),
  };
}

function parseComment(value: unknown, label: string): StudioCommentRecord {
  const item = requireRecord(value, label);
  const blockId = optionalString(item.blockId, `${label}.blockId`);
  const parentCommentId = optionalString(item.parentCommentId, `${label}.parentCommentId`);
  const resolvedBy = optionalString(item.resolvedBy, `${label}.resolvedBy`);
  const resolvedAt = optionalString(item.resolvedAt, `${label}.resolvedAt`);
  return {
    id: requireString(item.id, `${label}.id`),
    revisionId: requireString(item.revisionId, `${label}.revisionId`),
    ...(blockId ? { blockId } : {}),
    ...(parentCommentId ? { parentCommentId } : {}),
    body: requireString(item.body, `${label}.body`),
    status: requireOneOf(item.status, ["open", "resolved", "reopened", "deleted"] as const, `${label}.status`),
    version: requireInteger(item.version, `${label}.version`),
    createdBy: requireString(item.createdBy, `${label}.createdBy`),
    ...(resolvedBy ? { resolvedBy } : {}),
    ...(resolvedAt ? { resolvedAt } : {}),
    createdAt: requireString(item.createdAt, `${label}.createdAt`),
    updatedAt: requireString(item.updatedAt, `${label}.updatedAt`),
  };
}

function parseReview(value: unknown, label: string): StudioReviewRecord {
  const item = requireRecord(value, label);
  const reviewedBy = optionalString(item.reviewedBy, `${label}.reviewedBy`);
  const reviewedAt = optionalString(item.reviewedAt, `${label}.reviewedAt`);
  const decisionNotes = optionalString(item.decisionNotes, `${label}.decisionNotes`);
  return {
    id: requireString(item.id, `${label}.id`),
    revisionId: requireString(item.revisionId, `${label}.revisionId`),
    status: requireOneOf(item.status, ["pending", "approved", "changes-requested", "cancelled"] as const, `${label}.status`),
    requestedBy: requireString(item.requestedBy, `${label}.requestedBy`),
    requestedAt: requireString(item.requestedAt, `${label}.requestedAt`),
    ...(reviewedBy ? { reviewedBy } : {}),
    ...(reviewedAt ? { reviewedAt } : {}),
    ...(decisionNotes ? { decisionNotes } : {}),
    version: requireInteger(item.version, `${label}.version`),
  };
}

export function parseStudioWorkspace(value: unknown, institutionId: string): StudioWorkspace {
  const record = requireRecord(value, "Studio workspace");
  sameInstitution(requireString(record.institutionId, "Studio workspace.institutionId"), institutionId, "Studio workspace");
  return {
    institutionId,
    spaces: requireRecordArray(record.spaces, "Studio workspace.spaces").map((item, index) => parseCourseSpace(item, `Studio workspace.spaces[${index}]`, institutionId)),
    modules: requireRecordArray(record.modules, "Studio workspace.modules").map((item, index) => parseModule(item, `Studio workspace.modules[${index}]`)),
    lessons: requireRecordArray(record.lessons, "Studio workspace.lessons").map((item, index) => parseLesson(item, `Studio workspace.lessons[${index}]`)),
  };
}

export function parseStudioLessonDetail(value: unknown): StudioLessonDetail {
  const record = requireRecord(value, "Studio lesson detail");
  return {
    ...parseLesson(record, "Studio lesson detail"),
    revisions: requireRecordArray(record.revisions, "Studio lesson detail.revisions").map((item, index) => parseRevision(item, `Studio lesson detail.revisions[${index}]`)),
    comments: requireRecordArray(record.comments, "Studio lesson detail.comments").map((item, index) => parseComment(item, `Studio lesson detail.comments[${index}]`)),
    reviews: requireRecordArray(record.reviews, "Studio lesson detail.reviews").map((item, index) => parseReview(item, `Studio lesson detail.reviews[${index}]`)),
  };
}

function parseReusableBlock(value: unknown, label: string): StudioReusableBlockRecord {
  const item = requireRecord(value, label);
  return {
    id: requireString(item.id, `${label}.id`),
    name: requireString(item.name, `${label}.name`),
    blockType: requireOneOf(item.blockType, studioBlockTypes, `${label}.blockType`),
    content: requireRecord(item.content, `${label}.content`),
    status: requireOneOf(item.status, ["active", "retired"] as const, `${label}.status`),
    version: requireInteger(item.version, `${label}.version`),
    updatedAt: requireString(item.updatedAt, `${label}.updatedAt`),
  };
}

function parseAsset(value: unknown, label: string): StudioAssetRecord {
  const item = requireRecord(value, label);
  const courseSpaceId = optionalString(item.courseSpaceId, `${label}.courseSpaceId`);
  const altText = optionalString(item.altText, `${label}.altText`);
  const captionText = optionalString(item.captionText, `${label}.captionText`);
  const transcriptText = optionalString(item.transcriptText, `${label}.transcriptText`);
  const durationSeconds = optionalNumber(item.durationSeconds, `${label}.durationSeconds`);
  return {
    id: requireString(item.id, `${label}.id`),
    ...(courseSpaceId ? { courseSpaceId } : {}),
    assetKind: requireOneOf(item.assetKind, ["image", "video", "audio", "document", "archive", "other"] as const, `${label}.assetKind`),
    objectKey: requireString(item.objectKey, `${label}.objectKey`),
    originalFilename: requireString(item.originalFilename, `${label}.originalFilename`),
    mediaType: requireString(item.mediaType, `${label}.mediaType`),
    sizeBytes: requireInteger(item.sizeBytes, `${label}.sizeBytes`),
    checksumSha256: requireString(item.checksumSha256, `${label}.checksumSha256`),
    malwareStatus: requireOneOf(item.malwareStatus, ["pending", "clean", "infected", "failed"] as const, `${label}.malwareStatus`),
    ...(altText ? { altText } : {}),
    ...(captionText ? { captionText } : {}),
    ...(transcriptText ? { transcriptText } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    metadata: requireRecord(item.metadata, `${label}.metadata`),
    status: requireOneOf(item.status, ["processing", "ready", "quarantined", "deleted"] as const, `${label}.status`),
    version: requireInteger(item.version, `${label}.version`),
    createdAt: requireString(item.createdAt, `${label}.createdAt`),
    updatedAt: requireString(item.updatedAt, `${label}.updatedAt`),
  };
}

function parsePublication(value: unknown, label: string): StudioPublicationRecord {
  const item = requireRecord(value, label);
  const supersedesSnapshotId = optionalString(item.supersedesSnapshotId, `${label}.supersedesSnapshotId`);
  const rollbackOfSnapshotId = optionalString(item.rollbackOfSnapshotId, `${label}.rollbackOfSnapshotId`);
  return {
    id: requireString(item.id, `${label}.id`),
    courseSpaceId: requireString(item.courseSpaceId, `${label}.courseSpaceId`),
    courseTitle: requireString(item.courseTitle, `${label}.courseTitle`),
    publicationNumber: requireInteger(item.publicationNumber, `${label}.publicationNumber`),
    sourceReviewId: requireString(item.sourceReviewId, `${label}.sourceReviewId`),
    checksumSha256: requireString(item.checksumSha256, `${label}.checksumSha256`),
    status: requireOneOf(item.status, ["current", "superseded", "withdrawn"] as const, `${label}.status`),
    ...(supersedesSnapshotId ? { supersedesSnapshotId } : {}),
    ...(rollbackOfSnapshotId ? { rollbackOfSnapshotId } : {}),
    publishedAt: requireString(item.publishedAt, `${label}.publishedAt`),
  };
}

function parseImportReport(value: unknown, label: string): StudioImportReportRecord {
  const item = requireRecord(value, label);
  const courseSpaceId = optionalString(item.courseSpaceId, `${label}.courseSpaceId`);
  return {
    id: requireString(item.id, `${label}.id`),
    ...(courseSpaceId ? { courseSpaceId } : {}),
    sourceFormat: requireOneOf(item.sourceFormat, ["common-cartridge", "canvas", "moodle", "scorm", "veza-json"] as const, `${label}.sourceFormat`),
    sourceChecksum: requireString(item.sourceChecksum, `${label}.sourceChecksum`),
    compatibilityStatus: requireOneOf(item.compatibilityStatus, ["compatible", "compatible-with-warnings", "incompatible"] as const, `${label}.compatibilityStatus`),
    report: requireRecord(item.report, `${label}.report`),
    createdAt: requireString(item.createdAt, `${label}.createdAt`),
  };
}

export function parseStudioLibrary(value: unknown, institutionId: string): StudioLibrary {
  const record = requireRecord(value, "Studio library");
  sameInstitution(requireString(record.institutionId, "Studio library.institutionId"), institutionId, "Studio library");
  return {
    institutionId,
    reusableBlocks: requireRecordArray(record.reusableBlocks, "Studio library.reusableBlocks").map((item, index) => parseReusableBlock(item, `Studio library.reusableBlocks[${index}]`)),
    assets: requireRecordArray(record.assets, "Studio library.assets").map((item, index) => parseAsset(item, `Studio library.assets[${index}]`)),
    publications: requireRecordArray(record.publications, "Studio library.publications").map((item, index) => parsePublication(item, `Studio library.publications[${index}]`)),
    importReports: requireRecordArray(record.importReports, "Studio library.importReports").map((item, index) => parseImportReport(item, `Studio library.importReports[${index}]`)),
  };
}

export function parseLearnerHome(value: unknown): LearnerHome {
  const record = requireRecord(value, "Learner home");
  return {
    learnerPersonId: requireString(record.learnerPersonId, "Learner home.learnerPersonId"),
    today: requireRecordArray(record.today, "Learner home.today").map((item, index) => {
      const label = `Learner home.today[${index}]`;
      const dueAt = optionalString(item.dueAt, `${label}.dueAt`);
      const startsAt = optionalString(item.startsAt, `${label}.startsAt`);
      return {
        kind: requireOneOf(item.kind, ["lesson", "assignment", "event", "announcement"] as const, `${label}.kind`),
        id: requireString(item.id, `${label}.id`),
        courseRunId: requireString(item.courseRunId, `${label}.courseRunId`),
        courseTitle: requireString(item.courseTitle, `${label}.courseTitle`),
        title: requireString(item.title, `${label}.title`),
        ...(dueAt ? { dueAt } : {}),
        ...(startsAt ? { startsAt } : {}),
        href: requireString(item.href, `${label}.href`),
        priority: requireInteger(item.priority, `${label}.priority`),
      };
    }),
    courses: requireRecordArray(record.courses, "Learner home.courses").map((item, index) => {
      const label = `Learner home.courses[${index}]`;
      const nextLessonId = optionalString(item.nextLessonId, `${label}.nextLessonId`);
      const nextLessonTitle = optionalString(item.nextLessonTitle, `${label}.nextLessonTitle`);
      return {
        enrolmentId: requireString(item.enrolmentId, `${label}.enrolmentId`),
        courseRunId: requireString(item.courseRunId, `${label}.courseRunId`),
        courseTitle: requireString(item.courseTitle, `${label}.courseTitle`),
        deliveryMode: requireString(item.deliveryMode, `${label}.deliveryMode`),
        progressPercent: requireNumber(item.progressPercent, `${label}.progressPercent`),
        completedLessons: requireInteger(item.completedLessons, `${label}.completedLessons`),
        totalLessons: requireInteger(item.totalLessons, `${label}.totalLessons`),
        ...(nextLessonId ? { nextLessonId } : {}),
        ...(nextLessonTitle ? { nextLessonTitle } : {}),
        startsOn: requireString(item.startsOn, `${label}.startsOn`),
        endsOn: requireString(item.endsOn, `${label}.endsOn`),
      };
    }),
    generatedAt: requireString(record.generatedAt, "Learner home.generatedAt"),
  };
}

export function parseLearnerCourseRoom(value: unknown): LearnerCourseRoom {
  const record = requireRecord(value, "Learner course room");
  return {
    enrolmentId: requireString(record.enrolmentId, "Learner course room.enrolmentId"),
    courseRunId: requireString(record.courseRunId, "Learner course room.courseRunId"),
    courseTitle: requireString(record.courseTitle, "Learner course room.courseTitle"),
    publicationSnapshotId: requireString(record.publicationSnapshotId, "Learner course room.publicationSnapshotId"),
    publicationChecksum: requireString(record.publicationChecksum, "Learner course room.publicationChecksum"),
    progressPercent: requireNumber(record.progressPercent, "Learner course room.progressPercent"),
    completedLessons: requireInteger(record.completedLessons, "Learner course room.completedLessons"),
    totalLessons: requireInteger(record.totalLessons, "Learner course room.totalLessons"),
    modules: requireRecordArray(record.modules, "Learner course room.modules").map((module, moduleIndex) => {
      const moduleLabel = `Learner course room.modules[${moduleIndex}]`;
      const description = optionalString(module.description, `${moduleLabel}.description`);
      return {
        id: requireString(module.id, `${moduleLabel}.id`),
        title: requireString(module.title, `${moduleLabel}.title`),
        ...(description ? { description } : {}),
        sequenceNumber: requireInteger(module.sequenceNumber, `${moduleLabel}.sequenceNumber`),
        completionPercent: requireNumber(module.completionPercent, `${moduleLabel}.completionPercent`),
        lessons: requireRecordArray(module.lessons, `${moduleLabel}.lessons`).map((lesson, lessonIndex) => {
          const lessonLabel = `${moduleLabel}.lessons[${lessonIndex}]`;
          const summary = optionalString(lesson.summary, `${lessonLabel}.summary`);
          const estimatedMinutes = optionalInteger(lesson.estimatedMinutes, `${lessonLabel}.estimatedMinutes`);
          return {
            id: requireString(lesson.id, `${lessonLabel}.id`),
            moduleId: requireString(lesson.moduleId, `${lessonLabel}.moduleId`),
            title: requireString(lesson.title, `${lessonLabel}.title`),
            ...(summary ? { summary } : {}),
            sequenceNumber: requireInteger(lesson.sequenceNumber, `${lessonLabel}.sequenceNumber`),
            ...(estimatedMinutes !== undefined ? { estimatedMinutes } : {}),
            blocks: requireRecordArray(lesson.blocks, `${lessonLabel}.blocks`).map((block, blockIndex) => parseBlock(block, `${lessonLabel}.blocks[${blockIndex}]`)),
            completionRule: requireRecord(lesson.completionRule, `${lessonLabel}.completionRule`),
            completed: requireBoolean(lesson.completed, `${lessonLabel}.completed`),
            bookmarked: requireBoolean(lesson.bookmarked, `${lessonLabel}.bookmarked`),
          };
        }),
      };
    }),
    announcements: requireRecordArray(record.announcements, "Learner course room.announcements"),
    timetable: requireRecordArray(record.timetable, "Learner course room.timetable"),
    discussions: requireRecordArray(record.discussions, "Learner course room.discussions"),
    offlineAvailable: requireBoolean(record.offlineAvailable, "Learner course room.offlineAvailable"),
    dataFreshness: requireString(record.dataFreshness, "Learner course room.dataFreshness"),
  };
}

export function parseGradebookSummary(value: unknown): GradebookSummary {
  const record = requireRecord(value, "Gradebook summary");
  return {
    courseRunId: requireString(record.courseRunId, "Gradebook summary.courseRunId"),
    categories: requireRecordArray(record.categories, "Gradebook summary.categories"),
    items: requireRecordArray(record.items, "Gradebook summary.items"),
    ...(optionalRecord(record.formula, "Gradebook summary.formula") ? { formula: requireRecord(record.formula, "Gradebook summary.formula") } : {}),
    results: requireRecordArray(record.results, "Gradebook summary.results"),
  };
}

export function parseAnalyticsMetrics(value: unknown): readonly AnalyticsMetric[] {
  if (!Array.isArray(value)) throw new Error("Analytics metrics did not match the API contract");
  return value.map((entry, index) => {
    const label = `Analytics metrics[${index}]`;
    const item = requireRecord(entry, label);
    return {
      key: requireString(item.key, `${label}.key`),
      title: requireString(item.title, `${label}.title`),
      description: requireString(item.description, `${label}.description`),
      unit: requireString(item.unit, `${label}.unit`),
      value: requireNumber(item.value, `${label}.value`),
      measuredAt: requireString(item.measuredAt, `${label}.measuredAt`),
      sourceMaxOccurredAt: requireString(item.sourceMaxOccurredAt, `${label}.sourceMaxOccurredAt`),
      freshnessSeconds: requireInteger(item.freshnessSeconds, `${label}.freshnessSeconds`),
      drillthroughFilter: requireRecord(item.drillthroughFilter, `${label}.drillthroughFilter`),
    };
  });
}

export function parseRecord(value: unknown, label: string): JsonRecord {
  return requireRecord(value, label);
}

export function parseRecordItems(value: unknown, label: string): readonly JsonRecord[] {
  const record = requireRecord(value, label);
  return optionalRecordArray(record.items, `${label}.items`);
}
