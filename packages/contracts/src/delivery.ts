export type OfferingStatus = "draft" | "open" | "closed" | "completed" | "cancelled";
export type WaitlistStatus = "waiting" | "offered" | "promoted" | "declined" | "expired" | "cancelled";
export type TimetableSlotStatus = "scheduled" | "cancelled" | "completed";

export interface CourseOfferingSummary {
  readonly id: string;
  readonly institutionId: string;
  readonly courseRunId: string;
  readonly code: string;
  readonly title: string;
  readonly registrationMode: "managed" | "self-service" | "invitation-only";
  readonly status: OfferingStatus;
  readonly opensAt?: string;
  readonly closesAt?: string;
  readonly capacity?: number;
  readonly occupied: number;
  readonly available?: number;
  readonly waitlistEnabled: boolean;
  readonly waitlistCount: number;
  readonly version: number;
}

export interface CourseRunOverlayRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly courseRunId: string;
  readonly overlay: Readonly<Record<string, unknown>>;
  readonly version: number;
}

export interface TimetableSlotRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly courseRunId: string;
  readonly classSectionId?: string;
  readonly startsAt: string;
  readonly endsAt: string;
  readonly timezone: string;
  readonly deliveryMode: "in_person" | "online" | "blended" | "workplace";
  readonly roomKey?: string;
  readonly locationLabel?: string;
  readonly onlineJoinUrl?: string;
  readonly recurrenceKey?: string;
  readonly status: TimetableSlotStatus;
  readonly version: number;
}

export interface WaitlistEntryRecord {
  readonly id: string;
  readonly institutionId: string;
  readonly offeringId: string;
  readonly learnerPersonId: string;
  readonly learnerDisplayName: string;
  readonly requestedAt: string;
  readonly priority: number;
  readonly position: number;
  readonly status: WaitlistStatus;
  readonly offerExpiresAt?: string;
  readonly promotedEnrolmentId?: string;
  readonly version: number;
}

export interface EnrolmentMembershipPeriodRecord {
  readonly id: string;
  readonly enrolmentId: string;
  readonly status: "pending" | "active" | "waitlisted" | "withdrawn" | "completed" | "cancelled";
  readonly effectiveFrom: string;
  readonly effectiveUntil?: string;
  readonly reason: string;
  readonly actorId: string;
  readonly correlationId: string;
}

export interface DeliveryWorkspace {
  readonly institutionId: string;
  readonly offerings: readonly CourseOfferingSummary[];
  readonly overlays: readonly CourseRunOverlayRecord[];
  readonly timetable: readonly TimetableSlotRecord[];
  readonly waitlist: readonly WaitlistEntryRecord[];
}
