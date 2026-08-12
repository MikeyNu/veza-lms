import type {
  AnalyticsMetric,
  GradebookSummary,
  LearnerCourseRoom,
  LearnerHome,
  StudioLessonDetail,
  StudioLibrary,
  StudioWorkspace,
} from "@veza/contracts";
import {
  parseAnalyticsMetrics,
  parseGradebookSummary,
  parseLearnerCourseRoom,
  parseLearnerHome,
  parseRecord,
  parseStudioLessonDetail,
  parseStudioLibrary,
  parseStudioWorkspace,
} from "./learning-platform-contracts";
import { requestWorkspaceJson } from "./workspace-json-request";

const maximumBytes = 4 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function demoMode(): boolean {
  return process.env.VEZA_DEMO_MODE === "true";
}

async function request(path: string): Promise<unknown> {
  return requestWorkspaceJson(path, {
    service: "Learning service",
    maximumBytes,
    timeoutMs: 20_000,
  });
}

function requireUuid(value: string, label: string): void {
  if (!uuid.test(value)) throw new Error(`${label} identifier is invalid`);
}

function demoLearnerHome(): LearnerHome {
  return {
    learnerPersonId: "00000000-0000-4000-8000-000000000101",
    generatedAt: new Date().toISOString(),
    today: [
      {
        id: "00000000-0000-4000-8000-000000001001",
        kind: "lesson",
        courseRunId: "00000000-0000-4000-8000-000000001201",
        title: "Welcome to Veza Learning",
        courseTitle: "Platform Orientation",
        href: "/learning",
        priority: 1,
      },
    ],
    courses: [
      {
        enrolmentId: "00000000-0000-4000-8000-000000001101",
        courseRunId: "00000000-0000-4000-8000-000000001201",
        courseTitle: "Platform Orientation",
        deliveryMode: "guided",
        nextLessonTitle: "Explore your workspace",
        progressPercent: 35,
        completedLessons: 2,
        totalLessons: 6,
        startsOn: new Date().toISOString(),
        endsOn: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      },
    ],
  };
}

function demoLearnerCourseRoom(enrolmentId: string): LearnerCourseRoom {
  return {
    enrolmentId,
    courseRunId: "00000000-0000-4000-8000-000000001201",
    courseTitle: "Platform Orientation",
    publicationSnapshotId: "00000000-0000-4000-8000-000000001301",
    publicationChecksum: "demo-publication-checksum",
    progressPercent: 35,
    completedLessons: 2,
    totalLessons: 6,
    modules: [
      {
        id: "00000000-0000-4000-8000-000000001401",
        title: "Getting started",
        sequenceNumber: 1,
        completionPercent: 35,
        lessons: [
          {
            id: "00000000-0000-4000-8000-000000001501",
            moduleId: "00000000-0000-4000-8000-000000001401",
            title: "Explore your workspace",
            sequenceNumber: 1,
            blocks: [
              {
                id: "00000000-0000-4000-8000-000000001601",
                type: "paragraph",
                data: { text: "This is demo-mode course content for local design preview." },
              },
            ],
            completionRule: {},
            completed: false,
            bookmarked: false,
          },
        ],
      },
    ],
    announcements: [],
    timetable: [],
    discussions: [],
    offlineAvailable: true,
    dataFreshness: new Date().toISOString(),
  };
}

export async function loadStudioWorkspace(institutionId: string): Promise<StudioWorkspace> {
  requireUuid(institutionId, "Institution");
  return parseStudioWorkspace(await request(`/v1/institutions/${institutionId}/studio`), institutionId);
}

export async function loadStudioLibrary(institutionId: string): Promise<StudioLibrary> {
  requireUuid(institutionId, "Institution");
  return parseStudioLibrary(await request(`/v1/institutions/${institutionId}/studio/library`), institutionId);
}

export async function loadStudioLesson(institutionId: string, lessonId: string): Promise<StudioLessonDetail> {
  requireUuid(institutionId, "Institution");
  requireUuid(lessonId, "Lesson");
  return parseStudioLessonDetail(await request(`/v1/institutions/${institutionId}/studio/lessons/${lessonId}`));
}

export async function loadLearnerToday(): Promise<LearnerHome> {
  try {
    return parseLearnerHome(await request("/v1/learner/home"));
  } catch (error) {
    if (demoMode()) return demoLearnerHome();
    throw error;
  }
}

export async function loadLearnerCourseRoom(enrolmentId: string, lowBandwidth = false): Promise<LearnerCourseRoom> {
  requireUuid(enrolmentId, "Enrolment");
  try {
    return parseLearnerCourseRoom(
      await request(`/v1/learner/enrolments/${enrolmentId}/course-room?lowBandwidth=${lowBandwidth ? "true" : "false"}`),
    );
  } catch (error) {
    if (demoMode()) return demoLearnerCourseRoom(enrolmentId);
    throw error;
  }
}

export async function loadLearnerAssignments(): Promise<Readonly<Record<string, unknown>>> {
  return parseRecord(await request("/v1/learner/assignments"), "Learner assignments");
}

export async function loadLearnerGradebook(courseRunId: string): Promise<Readonly<Record<string, unknown>>> {
  requireUuid(courseRunId, "Course run");
  return parseRecord(await request(`/v1/learner/gradebook/${courseRunId}`), "Learner gradebook");
}

export async function loadGradebook(courseRunId: string): Promise<GradebookSummary> {
  requireUuid(courseRunId, "Course run");
  return parseGradebookSummary(await request(`/v1/academic-evidence/gradebook/${courseRunId}`));
}

export async function loadStaffGradebook(courseRunId: string): Promise<Readonly<Record<string, unknown>>> {
  requireUuid(courseRunId, "Course run");
  return parseRecord(await request(`/v1/academic-evidence/gradebook/${courseRunId}/staff`), "Staff gradebook");
}

export async function loadAcademicEvidenceWorkspace(institutionId: string): Promise<Readonly<Record<string, unknown>>> {
  requireUuid(institutionId, "Institution");
  const record = parseRecord(await request(`/v1/institutions/${institutionId}/academic-evidence`), "Academic evidence workspace");
  if (record.institutionId !== undefined && record.institutionId !== institutionId) {
    throw new Error("Academic evidence workspace crossed the requested institution boundary");
  }
  return record;
}

export async function loadAnalytics(institutionId: string): Promise<readonly AnalyticsMetric[]> {
  requireUuid(institutionId, "Institution");
  return parseAnalyticsMetrics(await request(`/v1/academic-evidence/analytics?institutionId=${institutionId}`));
}
