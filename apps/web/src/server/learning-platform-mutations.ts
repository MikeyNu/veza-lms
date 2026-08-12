import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 4 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function request(path: string, init: RequestInit): Promise<unknown> {
  return requestWorkspaceJson(path, {
    service: "Learning service",
    maximumBytes,
    timeoutMs: 20_000,
    init,
  });
}

function requireUuid(value: string, label: string): void {
  if (!uuid.test(value)) throw new Error(`${label} identifier is invalid`);
}

function inputUuid(input: Readonly<Record<string, unknown>>, key: string, label: string): string {
  const value = input[key];
  if (typeof value !== "string" || !uuid.test(value)) throw new Error(`${label} identifier is invalid`);
  return value;
}

function optionalInputUuid(input: Readonly<Record<string, unknown>>, key: string, label: string): string | undefined {
  const value = input[key];
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !uuid.test(value)) throw new Error(`${label} identifier is invalid`);
  return value;
}

export function mutateStudio(institutionId: string, operation: string, input: Record<string, unknown>): Promise<unknown> {
  requireUuid(institutionId, "Institution");
  const map: Readonly<Record<string, { method: "POST" | "PUT"; path: (body: Record<string, unknown>) => string }>> = {
    "course-space-create": { method: "POST", path: () => "course-spaces" },
    "module-create": { method: "POST", path: () => "modules" },
    "lesson-create": { method: "POST", path: () => "lessons" },
    "revision-save": { method: "PUT", path: (body) => `lessons/${inputUuid(body, "lessonId", "Lesson")}/revisions` },
    "reusable-block-create": { method: "POST", path: () => "reusable-blocks" },
    "asset-register": { method: "POST", path: () => "assets" },
    "asset-scan": { method: "POST", path: (body) => `assets/${inputUuid(body, "assetId", "Asset")}/scan` },
    "comment-create": { method: "POST", path: (body) => `lessons/${inputUuid(body, "lessonId", "Lesson")}/comments` },
    "comment-status": { method: "PUT", path: (body) => `comments/${inputUuid(body, "commentId", "Comment")}/status` },
    "review-request": { method: "POST", path: (body) => `lessons/${inputUuid(body, "lessonId", "Lesson")}/reviews` },
    "review-decision": { method: "POST", path: (body) => `reviews/${inputUuid(body, "reviewId", "Review")}/decision` },
    "course-publish": { method: "POST", path: (body) => `course-spaces/${inputUuid(body, "courseSpaceId", "Course space")}/publish` },
    "import-analyse": { method: "POST", path: () => "imports/analyse" },
  };
  const target = map[operation];
  if (!target) throw new Error("Studio operation is not allowed");
  const path = target.path(input);
  const { lessonId: _lessonId, commentId: _commentId, reviewId: _reviewId, courseSpaceId: _courseSpaceId, assetId: _assetId, ...payload } = input;
  return request(`/v1/institutions/${institutionId}/studio/${path}`, { method: target.method, body: JSON.stringify(payload) });
}

export function mutateLearner(enrolmentId: string, operation: string, input: Record<string, unknown>): Promise<unknown> {
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
  return request(`/v1/learner/enrolments/${enrolmentId}/${path}`, { method: "POST", body: JSON.stringify(input) });
}

export function mutateAcademic(operation: string, input: Record<string, unknown>): Promise<unknown> {
  const map: Readonly<Record<string, { method: "POST"; path: (body: Record<string, unknown>) => string }>> = {
    "assignment-create": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/assignments` },
    "assignment-publish": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/assignments/${inputUuid(body, "assignmentId", "Assignment")}/publish` },
    accommodation: { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/assignments/${inputUuid(body, "assignmentId", "Assignment")}/accommodations` },
    "rubric-create": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/rubrics` },
    "rubric-submit": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/rubrics/${inputUuid(body, "rubricId", "Rubric")}/submit` },
    "rubric-approve": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/rubrics/${inputUuid(body, "rubricId", "Rubric")}/approve` },
    "rubric-attach": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/assignments/${inputUuid(body, "assignmentId", "Assignment")}/rubric` },
    "assignment-group-create": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/assignments/${inputUuid(body, "assignmentId", "Assignment")}/groups` },
    "assignment-group-members": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/assignment-groups/${inputUuid(body, "groupId", "Assignment group")}/members` },
    "submission-start": { method: "POST", path: () => "submissions" },
    "submission-file": { method: "POST", path: (body) => `submissions/${inputUuid(body, "attemptId", "Submission attempt")}/files` },
    "submission-offset": { method: "POST", path: (body) => `submission-files/${inputUuid(body, "fileId", "Submission file")}/offset` },
    "submission-finalize": { method: "POST", path: (body) => `submissions/${inputUuid(body, "attemptId", "Submission attempt")}/finalize` },
    "marker-allocate": { method: "POST", path: (body) => `submissions/${inputUuid(body, "attemptId", "Submission attempt")}/markers` },
    "mark-record": { method: "POST", path: (body) => `submissions/${inputUuid(body, "attemptId", "Submission attempt")}/marks` },
    "mark-release": { method: "POST", path: (body) => `marks/${inputUuid(body, "markId", "Mark")}/release` },
    "grade-category": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/gradebook/categories` },
    "grade-item": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/gradebook/items` },
    "formula-create": { method: "POST", path: () => "gradebook/formulas" },
    "formula-activate": { method: "POST", path: (body) => `gradebook/formulas/${inputUuid(body, "formulaId", "Formula")}/activate` },
    "grade-override": { method: "POST", path: () => "gradebook/results/override" },
    "grade-publish": { method: "POST", path: () => "gradebook/results/publish" },
    "certificate-template": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/certificate-templates` },
    "certificate-template-submit": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/certificate-templates/${inputUuid(body, "templateId", "Certificate template")}/submit` },
    "certificate-template-approve": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/certificate-templates/${inputUuid(body, "templateId", "Certificate template")}/approve` },
    "award-rule": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/award-rules` },
    "award-evaluate": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/award-rules/${inputUuid(body, "awardRuleId", "Award rule")}/evaluate` },
    "certificate-issue": { method: "POST", path: (body) => `institutions/${inputUuid(body, "institutionId", "Institution")}/certificates` },
    "certificate-revoke": { method: "POST", path: (body) => `certificates/${inputUuid(body, "certificateId", "Certificate")}/revoke` },
    export: { method: "POST", path: (body) => {
      const institutionId = optionalInputUuid(body, "institutionId", "Institution");
      return `exports${institutionId ? `?institutionId=${institutionId}` : ""}`;
    } },
  };
  const target = map[operation];
  if (!target) throw new Error("Academic operation is not allowed");
  const path = target.path(input);
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
  return request(`/v1/academic-evidence/${path}`, { method: target.method, body: JSON.stringify(payload) });
}
