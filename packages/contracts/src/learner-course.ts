import type { StudioBlock } from "./studio.js";

export interface LearnerTodayItem {
  readonly kind: "lesson" | "assignment" | "event" | "announcement";
  readonly id: string;
  readonly courseRunId: string;
  readonly courseTitle: string;
  readonly title: string;
  readonly dueAt?: string;
  readonly startsAt?: string;
  readonly href: string;
  readonly priority: number;
}

export interface LearnerCourseCard {
  readonly enrolmentId: string;
  readonly courseRunId: string;
  readonly courseTitle: string;
  readonly deliveryMode: string;
  readonly progressPercent: number;
  readonly completedLessons: number;
  readonly totalLessons: number;
  readonly nextLessonId?: string;
  readonly nextLessonTitle?: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

export interface LearnerLessonView {
  readonly id: string;
  readonly moduleId: string;
  readonly title: string;
  readonly summary?: string;
  readonly sequenceNumber: number;
  readonly estimatedMinutes?: number;
  readonly blocks: readonly StudioBlock[];
  readonly completionRule: Readonly<Record<string, unknown>>;
  readonly completed: boolean;
  readonly bookmarked: boolean;
}

export interface LearnerModuleView {
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly sequenceNumber: number;
  readonly completionPercent: number;
  readonly lessons: readonly LearnerLessonView[];
}

export interface LearnerCourseRoom {
  readonly enrolmentId: string;
  readonly courseRunId: string;
  readonly courseTitle: string;
  readonly publicationSnapshotId: string;
  readonly publicationChecksum: string;
  readonly progressPercent: number;
  readonly completedLessons: number;
  readonly totalLessons: number;
  readonly modules: readonly LearnerModuleView[];
  readonly announcements: readonly Readonly<Record<string, unknown>>[];
  readonly timetable: readonly Readonly<Record<string, unknown>>[];
  readonly discussions: readonly Readonly<Record<string, unknown>>[];
  readonly offlineAvailable: boolean;
  readonly dataFreshness: string;
}

export interface LearnerHome {
  readonly learnerPersonId: string;
  readonly today: readonly LearnerTodayItem[];
  readonly courses: readonly LearnerCourseCard[];
  readonly generatedAt: string;
}

export type LearnerToday = LearnerHome;
