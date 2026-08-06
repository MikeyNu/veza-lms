import type {
  AnalyticsMetric,
  GradebookSummary,
  LearnerCourseRoom,
  LearnerHome,
  StudioLessonDetail,
  StudioLibrary,
  StudioWorkspace,
} from "@veza/contracts";
import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 4 * 1024 * 1024;
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  return (await requestWorkspaceJson(path, {
    service: "Learning service",
    maximumBytes,
    timeoutMs: 20_000,
    ...(init ? { init } : {}),
  })) as T;
}

function requireUuid(value: string, label: string): void {
  if (!uuid.test(value)) throw new Error(`${label} identifier is invalid`);
}

export function loadStudioWorkspace(institutionId: string): Promise<StudioWorkspace> {
  requireUuid(institutionId, "Institution");
  return request(`/v1/institutions/${institutionId}/studio`);
}

export function loadStudioLibrary(institutionId: string): Promise<StudioLibrary> {
  requireUuid(institutionId, "Institution");
  return request(`/v1/institutions/${institutionId}/studio/library`);
}

export function loadStudioLesson(
  institutionId: string,
  lessonId: string,
): Promise<StudioLessonDetail> {
  requireUuid(institutionId, "Institution");
  requireUuid(lessonId, "Lesson");
  return request(`/v1/institutions/${institutionId}/studio/lessons/${lessonId}`);
}

export function mutateStudio(
  institutionId: string,
  operation: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  requireUuid(institutionId, "Institution");
  const map: Readonly<
    Record<
      string,
      { method: "POST" | "PUT"; path: (body: Record<string, unknown>) => string }
    >
  > = {
    "course-space-create": { method: "POST", path: () => "course-spaces" },
    "module-create": { method: "POST", path: () => "modules" },
    "lesson-create": { method: "POST", path: () => "lessons" },
    "revision-save": {
      method: "PUT",
      path: (body) => `lessons/${String(body.lessonId)}/revisions`,
    },
    "reusable-block-create": { method: "POST", path: () => "reusable-blocks" },
    "asset-register": { method: "POST", path: () => "assets" },
    "asset-scan": {
      method: "POST",
      path: (body) => `assets/${String(body.assetId)}/scan`,
    },
    "comment-create": {
      method: "POST",
      path: (body) => `lessons/${String(body.lessonId)}/comments`,
    },
    "comment-status": {
      method: "PUT",
      path: (body) => `comments/${String(body.commentId)}/status`,
    },
    "review-request": {
      method: "POST",
      path: (body) => `lessons/${String(body.lessonId)}/reviews`,
    },
    "review-decision": {
      method: "POST",
      path: (body) => `reviews/${String(body.reviewId)}/decision`,
    },
    "course-publish": {
      method: "POST",
      path: (body) => `course-spaces/${String(body.courseSpaceId)}/publish`,
    },
    "import-analyse": { method: "POST", path: () => "imports/analyse" },
  };
  const target = map[operation];
  if (!target) throw new Error("Studio operation is not allowed");
  const {
    lessonId: _lessonId,
    commentId: _commentId,
    reviewId: _reviewId,
    courseSpaceId: _courseSpaceId,
    assetId: _assetId,
    ...payload
  } = input;
  return request(`/v1/institutions/${institutionId}/studio/${target.path(input)}`, {
    method: target.method,
    body: JSON.stringify(payload),
  });
}

export function loadLearnerToday(): Promise<LearnerHome> {
  return request("/v1/learner/home");
}

export function loadLearnerCourseRoom(
  enrolmentId: string,
  lowBandwidth = false,
): Promise<LearnerCourseRoom> {
  requireUuid(enrolmentId, "Enrolment");
  return request(
    `/v1/learner/enrolments/${enrolmentId}/course-room?lowBandwidth=${lowBandwidth ? "true" : "false"}`,
  );
}

export function loadLearnerAssignments(): Promise<Readonly<Record<string, unknown>>> {
  return request("/v1/learner/assignments");
}

export function loadLearnerGradebook(
  courseRunId: string,
): Promise<Readonly<Record<string, unknown>>> {
  requireUuid(courseRunId, "Course run");
  return request(`/v1/learner/gradebook/${courseRunId}`);
}

export function mutateLearner(
  enrolmentId: string,
  operation: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  requireUuid(enrolmentId, "Enrolment");
  const map: Readonly<Record<string, string>> = {
    evidence: "evidence",
    bookmark: "bookmarks",
    discussion: "discussion-posts",
    offline: "offline-manifest",
    sync: "sync",
  };
  const path = map[operation];
  if (!path) throw new Error("Learner operation is not allowed");
  return request(`/v1/learner/enrolments/${enrolmentId}/${path}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function loadGradebook(courseRunId: string): Promise<GradebookSummary> {
  requireUuid(courseRunId, "Course run");
  return request(`/v1/academic-evidence/gradebook/${courseRunId}`);
}

export function loadStaffGradebook(
  courseRunId: string,
): Promise<Readonly<Record<string, unknown>>> {
  requireUuid(courseRunId, "Course run");
  return request(`/v1/academic-evidence/gradebook/${courseRunId}/staff`);
}

export function loadAcademicEvidenceWorkspace(
  institutionId: string,
): Promise<Readonly<Record<string, unknown>>> {
  requireUuid(institutionId, "Institution");
  return request(`/v1/institutions/${institutionId}/academic-evidence`);
}

export function loadAnalytics(institutionId: string): Promise<readonly AnalyticsMetric[]> {
  requireUuid(institutionId, "Institution");
  return request(`/v1/academic-evidence/analytics?institutionId=${institutionId}`);
}

export function mutateAcademic(
  operation: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const institutionId =
    typeof input.institutionId === "string" ? input.institutionId : undefined;
  const map: Readonly<
    Record<string, { method: "POST"; path: (body: Record<string, unknown>) => string }>
  > = {
    "assignment-create": {
      method: "POST",
      path: () => `institutions/${institutionId}/assignments`,
    },
    "assignment-publish": {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/assignments/${String(body.assignmentId)}/publish`,
    },
    accommodation: {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/assignments/${String(body.assignmentId)}/accommodations`,
    },
    "rubric-create": {
      method: "POST",
      path: () => `institutions/${institutionId}/rubrics`,
    },
    "rubric-submit": {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/rubrics/${String(body.rubricId)}/submit`,
    },
    "rubric-approve": {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/rubrics/${String(body.rubricId)}/approve`,
    },
    "rubric-attach": {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/assignments/${String(body.assignmentId)}/rubric`,
    },
    "assignment-group-create": {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/assignments/${String(body.assignmentId)}/groups`,
    },
    "assignment-group-members": {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/assignment-groups/${String(body.groupId)}/members`,
    },
    "submission-start": { method: "POST", path: () => "submissions" },
    "submission-file": {
      method: "POST",
      path: (body) => `submissions/${String(body.attemptId)}/files`,
    },
    "submission-offset": {
      method: "POST",
      path: (body) => `submission-files/${String(body.fileId)}/offset`,
    },
    "submission-finalize": {
      method: "POST",
      path: (body) => `submissions/${String(body.attemptId)}/finalize`,
    },
    "marker-allocate": {
      method: "POST",
      path: (body) => `submissions/${String(body.attemptId)}/markers`,
    },
    "mark-record": {
      method: "POST",
      path: (body) => `submissions/${String(body.attemptId)}/marks`,
    },
    "mark-release": {
      method: "POST",
      path: (body) => `marks/${String(body.markId)}/release`,
    },
    "grade-category": {
      method: "POST",
      path: () => `institutions/${institutionId}/gradebook/categories`,
    },
    "grade-item": {
      method: "POST",
      path: () => `institutions/${institutionId}/gradebook/items`,
    },
    "formula-create": { method: "POST", path: () => "gradebook/formulas" },
    "formula-activate": {
      method: "POST",
      path: (body) => `gradebook/formulas/${String(body.formulaId)}/activate`,
    },
    "grade-override": { method: "POST", path: () => "gradebook/results/override" },
    "grade-publish": { method: "POST", path: () => "gradebook/results/publish" },
    "certificate-template": {
      method: "POST",
      path: () => `institutions/${institutionId}/certificate-templates`,
    },
    "certificate-template-submit": {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/certificate-templates/${String(body.templateId)}/submit`,
    },
    "certificate-template-approve": {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/certificate-templates/${String(body.templateId)}/approve`,
    },
    "award-rule": {
      method: "POST",
      path: () => `institutions/${institutionId}/award-rules`,
    },
    "award-evaluate": {
      method: "POST",
      path: (body) =>
        `institutions/${institutionId}/award-rules/${String(body.awardRuleId)}/evaluate`,
    },
    "certificate-issue": {
      method: "POST",
      path: () => `institutions/${institutionId}/certificates`,
    },
    "certificate-revoke": {
      method: "POST",
      path: (body) => `certificates/${String(body.certificateId)}/revoke`,
    },
    export: {
      method: "POST",
      path: () => `exports${institutionId ? `?institutionId=${institutionId}` : ""}`,
    },
  };
  const target = map[operation];
  if (!target) throw new Error("Academic operation is not allowed");
  const {
    institutionId: _institutionId,
    assignmentId: _assignmentId,
    attemptId: _attemptId,
    fileId: _fileId,
    formulaId: _formulaId,
    certificateId: _certificateId,
    rubricId: _rubricId,
    groupId: _groupId,
    templateId: _templateId,
    awardRuleId: _awardRuleId,
    markId: _markId,
    ...payload
  } = input;
  return request(`/v1/academic-evidence/${target.path(input)}`, {
    method: target.method,
    body: JSON.stringify(payload),
  });
}
