import type { LearnerCalendarSlot } from "@veza/contracts";
import type { Route } from "next";
import Link from "next/link";
import { AppShell } from "../../src/components/app-shell";
import { institutionalHomeRoles } from "../../src/features/workspace/access-policy";
import { primaryRole } from "../../src/features/workspace/navigation";
import {
  loadInstitutionTimetable,
  type InstitutionCalendarSlot,
} from "../../src/server/delivery-api";
import { loadLearnerCalendar } from "../../src/server/learner-calendar-api";
import { requireWorkspaceAccess } from "../../src/server/require-workspace-access";

export const dynamic = "force-dynamic";

type Query = Readonly<Record<string, string | string[] | undefined>>;
type LocalDate = Readonly<{ year: number; month: number; day: number }>;
type CalendarSlot = Readonly<{
  id: string;
  courseRunId: string;
  courseTitle: string;
  title: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  deliveryMode: "in_person" | "online" | "blended" | "workplace";
  roomKey?: string;
  locationLabel?: string;
  onlineJoinUrl?: string;
}>;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function weekOffset(value: string | undefined): number {
  if (!value || !/^-?\d{1,3}$/.test(value)) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < -52 || parsed > 104) return 0;
  return parsed;
}

function safeTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-ZA", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "UTC";
  }
}

function datePartsAt(instant: Date, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: "year" | "month" | "day") => Number(parts.find((item) => item.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

function dateTimePartsAt(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const part = (type: "year" | "month" | "day" | "hour" | "minute" | "second") =>
    Number(parts.find((item) => item.type === type)?.value);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

function addDays(value: LocalDate, days: number): LocalDate {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days, 12));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function weekday(value: LocalDate): number {
  return new Date(Date.UTC(value.year, value.month - 1, value.day, 12)).getUTCDay();
}

function startOfWeek(reference: Date, timeZone: string, offset: number): LocalDate {
  const local = datePartsAt(reference, timeZone);
  const day = weekday(local);
  const daysFromMonday = day === 0 ? 6 : day - 1;
  return addDays(local, -daysFromMonday + offset * 7);
}

function zonedMidnight(value: LocalDate, timeZone: string): Date {
  const target = Date.UTC(value.year, value.month - 1, value.day, 0, 0, 0);
  let guess = target;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = dateTimePartsAt(new Date(guess), timeZone);
    const represented = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const correction = target - represented;
    guess += correction;
    if (correction === 0) break;
  }
  return new Date(guess);
}

function dateKey(value: LocalDate): string {
  return `${value.year}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}`;
}

function dateKeyAt(instant: string, timeZone: string): string {
  return dateKey(datePartsAt(new Date(instant), timeZone));
}

function dateLabel(value: LocalDate): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(value.year, value.month - 1, value.day, 12)));
}

function longDateLabel(value: LocalDate): string {
  return new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(value.year, value.month - 1, value.day, 12)));
}

function timeLabel(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(new Date(value));
}

function normaliseSlot(slot: InstitutionCalendarSlot | LearnerCalendarSlot): CalendarSlot {
  return {
    id: slot.id,
    courseRunId: slot.courseRunId,
    courseTitle: slot.courseTitle,
    title: slot.title,
    startsAt: slot.startsAt,
    endsAt: slot.endsAt,
    timezone: slot.timezone,
    deliveryMode: slot.deliveryMode,
    ...(slot.roomKey ? { roomKey: slot.roomKey } : {}),
    ...(slot.locationLabel ? { locationLabel: slot.locationLabel } : {}),
    ...(slot.onlineJoinUrl ? { onlineJoinUrl: slot.onlineJoinUrl } : {}),
  };
}

function locationLabel(slot: CalendarSlot): string {
  if (slot.locationLabel) return slot.locationLabel;
  if (slot.roomKey) return slot.roomKey;
  if (slot.deliveryMode === "online") return "Online";
  if (slot.deliveryMode === "workplace") return "Workplace";
  if (slot.deliveryMode === "blended") return "Blended delivery";
  return "Location not published";
}

function modeLabel(mode: CalendarSlot["deliveryMode"]): string {
  return mode.replaceAll("_", " ");
}

function weekHref(offset: number): Route {
  return (offset === 0 ? "/calendar" : `/calendar?week=${offset}`) as Route;
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Query> }) {
  const [resolution, query] = await Promise.all([
    requireWorkspaceAccess("/calendar"),
    searchParams,
  ]);
  const role = primaryRole(resolution.session);
  const displayTimeZone = safeTimezone(
    resolution.session.membership.timezone || resolution.session.tenant.timezone,
  );
  const offset = weekOffset(single(query.week));
  const weekStart = startOfWeek(new Date(), displayTimeZone, offset);
  const weekDays = Array.from({ length: 7 }, (_, index) => addDays(weekStart, index));
  const rangeStart = zonedMidnight(weekStart, displayTimeZone);
  const rangeEnd = zonedMidnight(addDays(weekStart, 7), displayTimeZone);
  const from = rangeStart.toISOString();
  const to = rangeEnd.toISOString();

  let slots: readonly CalendarSlot[] = [];
  let sourceError = "";
  let sourceLabel = "Published timetable";

  try {
    if (role === "learner") {
      const calendar = await loadLearnerCalendar(from, to);
      slots = calendar.slots.map(normaliseSlot);
      sourceLabel = "My enrolled timetable";
    } else if (institutionalHomeRoles.includes(role)) {
      const institutionId = resolution.session.membership.institutionIds[0];
      if (!institutionId) throw new Error("No active institution is available for this timetable");
      const calendar = await loadInstitutionTimetable(institutionId, from, to);
      slots = calendar.slots.map(normaliseSlot);
      sourceLabel = "Institution timetable";
    } else {
      sourceError = role === "guardian-sponsor"
        ? "Calendar disclosure is not available through the guardian summary permission."
        : "This workspace role does not have an authorised timetable read path.";
    }
  } catch {
    sourceError = "The published timetable could not be loaded. No synthetic schedule has been substituted.";
  }

  const orderedSlots = [...slots].sort((left, right) =>
    Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id),
  );
  const grouped = new Map<string, CalendarSlot[]>();
  for (const slot of orderedSlots) {
    const key = dateKeyAt(slot.startsAt, displayTimeZone);
    grouped.set(key, [...(grouped.get(key) ?? []), slot]);
  }
  const now = Date.now();
  const nextSlot = orderedSlots.find((slot) => Date.parse(slot.endsAt) > now);
  const uniqueCourses = new Set(orderedSlots.map((slot) => slot.courseRunId)).size;
  const onlineCount = orderedSlots.filter((slot) => slot.deliveryMode === "online").length;
  const currentDateKey = dateKeyAt(new Date().toISOString(), displayTimeZone);

  return (
    <AppShell session={resolution.session} active="calendar">
      <section className="workspace calendar-workspace" aria-labelledby="calendar-title">
        <header className="calendar-heading">
          <div>
            <p className="calendar-context-label">{sourceLabel}</p>
            <h1 id="calendar-title">{role === "registrar" ? "Timetable" : "Calendar"}</h1>
            <p>Published scheduling evidence for the selected week, shown in {displayTimeZone}.</p>
          </div>
          <nav className="calendar-period-controls" aria-label="Calendar week navigation">
            <Link href={weekHref(offset - 1)}>Previous week</Link>
            <strong>{longDateLabel(weekStart)} to {longDateLabel(weekDays[6]!)}</strong>
            {offset !== 0 ? <Link href="/calendar">Current week</Link> : <span aria-current="date">Current week</span>}
            <Link href={weekHref(offset + 1)}>Next week</Link>
          </nav>
        </header>

        <section className="calendar-week-strip" aria-label="Week overview">
          {weekDays.map((day) => {
            const key = dateKey(day);
            const count = grouped.get(key)?.length ?? 0;
            const isToday = key === currentDateKey;
            return (
              <div className={isToday ? "is-today" : undefined} key={key}>
                <span>{dateLabel(day)}</span>
                <strong>{count}</strong>
                <small>{count === 1 ? "session" : "sessions"}</small>
              </div>
            );
          })}
        </section>

        {sourceError ? (
          <section className="calendar-source-state" role="status">
            <div>
              <p>Schedule unavailable</p>
              <h2>No timetable data is being shown</h2>
              <span>{sourceError}</span>
            </div>
          </section>
        ) : (
          <div className="calendar-layout">
            <main className="calendar-agenda" aria-label="Published sessions">
              {weekDays.map((day) => {
                const key = dateKey(day);
                const daySlots = grouped.get(key) ?? [];
                return (
                  <section className={`calendar-day${key === currentDateKey ? " is-today" : ""}`} key={key}>
                    <header>
                      <div>
                        <span>{key === currentDateKey ? "Today" : "Day"}</span>
                        <h2>{dateLabel(day)}</h2>
                      </div>
                      <strong>{daySlots.length}</strong>
                    </header>
                    {daySlots.length ? (
                      <ol>
                        {daySlots.map((slot) => (
                          <li key={slot.id}>
                            <time dateTime={slot.startsAt}>
                              <strong>{timeLabel(slot.startsAt, displayTimeZone)}</strong>
                              <span>{timeLabel(slot.endsAt, displayTimeZone)}</span>
                            </time>
                            <div className="calendar-session-copy">
                              <span>{slot.courseTitle}</span>
                              <h3>{slot.title}</h3>
                              <p>{locationLabel(slot)} · {modeLabel(slot.deliveryMode)}</p>
                              {slot.timezone !== displayTimeZone ? <small>Published in {slot.timezone}</small> : null}
                            </div>
                            {slot.onlineJoinUrl ? (
                              <a href={slot.onlineJoinUrl} target="_blank" rel="noreferrer">Open online session</a>
                            ) : null}
                          </li>
                        ))}
                      </ol>
                    ) : <p className="calendar-empty-day">No published sessions.</p>}
                  </section>
                );
              })}
            </main>

            <aside className="calendar-context" aria-label="Week context">
              <section className="calendar-side-section calendar-up-next">
                <header>
                  <div><span>Next session</span><h2>{nextSlot ? nextSlot.title : "Nothing scheduled next"}</h2></div>
                </header>
                {nextSlot ? (
                  <div className="calendar-next-detail">
                    <strong>{nextSlot.courseTitle}</strong>
                    <time dateTime={nextSlot.startsAt}>{dateLabel(datePartsAt(new Date(nextSlot.startsAt), displayTimeZone))}, {timeLabel(nextSlot.startsAt, displayTimeZone)}</time>
                    <span>{locationLabel(nextSlot)}</span>
                  </div>
                ) : <p>No later session exists in this selected week.</p>}
              </section>

              <section className="calendar-side-section">
                <header><div><span>Week evidence</span><h2>Schedule summary</h2></div></header>
                <dl className="calendar-summary-list">
                  <div><dt>Scheduled sessions</dt><dd>{orderedSlots.length}</dd></div>
                  <div><dt>Course runs</dt><dd>{uniqueCourses}</dd></div>
                  <div><dt>Online sessions</dt><dd>{onlineCount}</dd></div>
                  <div><dt>Display timezone</dt><dd>{displayTimeZone}</dd></div>
                </dl>
              </section>

              <section className="calendar-side-section calendar-boundary-note">
                <header><div><span>Data boundary</span><h2>{role === "learner" ? "Your enrolments only" : "Current institution only"}</h2></div></header>
                <p>{role === "learner"
                  ? "Sessions are returned only when they belong to your current enrolments and matching class sections."
                  : "The timetable query is bounded to the active tenant, institution and selected week."}</p>
              </section>
            </aside>
          </div>
        )}
      </section>
    </AppShell>
  );
}
