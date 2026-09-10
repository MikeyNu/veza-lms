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
  version: number;
}>;

type GridEvent = Readonly<{
  slot: CalendarSlot;
  day: number;
  row: number;
  span: number;
  category: "lecture" | "lab" | "seminar" | "meeting" | "live";
}>;

const baseHour = 8;
const visibleHours = 10;
const maximumWeekOffset = 104;
const minimumWeekOffset = -52;
const times = [
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
] as const;

function single(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value.length ? value : undefined;
}

function weekOffset(value: string | undefined): number {
  if (!value || !/^-?\d{1,3}$/.test(value)) return 0;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimumWeekOffset || parsed > maximumWeekOffset) return 0;
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
  const part = (type: "year" | "month" | "day") =>
    Number(parts.find((item) => item.type === type)?.value);
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

function dateKeyAt(value: string | Date, timeZone: string): string {
  const instant = typeof value === "string" ? new Date(value) : value;
  return dateKey(datePartsAt(instant, timeZone));
}

function dayHeading(value: LocalDate): readonly [string, string] {
  const instant = new Date(Date.UTC(value.year, value.month - 1, value.day, 12));
  const weekdayLabel = new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    timeZone: "UTC",
  }).format(instant);
  const dateLabel = new Intl.DateTimeFormat("en-ZA", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(instant);
  return [weekdayLabel, dateLabel];
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

function timeRangeLabel(slot: CalendarSlot, timeZone: string): string {
  return `${timeLabel(slot.startsAt, timeZone)} - ${timeLabel(slot.endsAt, timeZone)}`;
}

function dateLabelForSlot(slot: CalendarSlot, timeZone: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone,
  }).format(new Date(slot.startsAt));
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
    version: slot.version,
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
  if (mode === "in_person") return "In person";
  if (mode === "online") return "Online";
  if (mode === "blended") return "Blended";
  return "Workplace";
}

function categoryForMode(mode: CalendarSlot["deliveryMode"]): GridEvent["category"] {
  if (mode === "online") return "live";
  if (mode === "blended") return "seminar";
  if (mode === "workplace") return "meeting";
  return "lecture";
}

function gridPlacement(
  slot: CalendarSlot,
  weekdayKeys: readonly string[],
  timeZone: string,
): Omit<GridEvent, "slot" | "category"> | undefined {
  const day = weekdayKeys.indexOf(dateKeyAt(slot.startsAt, timeZone));
  if (day < 0) return undefined;
  const parts = dateTimePartsAt(new Date(slot.startsAt), timeZone);
  const startMinutes = parts.hour * 60 + parts.minute;
  const minimum = baseHour * 60;
  const maximum = (baseHour + visibleHours) * 60;
  if (startMinutes < minimum || startMinutes >= maximum) return undefined;
  const durationMinutes = Math.max(1, Math.ceil((Date.parse(slot.endsAt) - Date.parse(slot.startsAt)) / 60_000));
  const row = Math.floor((startMinutes - minimum) / 60) + 2;
  const requestedSpan = Math.max(1, Math.ceil(durationMinutes / 60));
  const span = Math.min(requestedSpan, 12 - row);
  return { day: day + 1, row, span };
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
  const weekdays = weekDays.slice(0, 5);
  const weekdayKeys = weekdays.map(dateKey);
  const rangeStart = zonedMidnight(weekStart, displayTimeZone);
  const rangeEnd = zonedMidnight(addDays(weekStart, 7), displayTimeZone);
  const from = rangeStart.toISOString();
  const to = rangeEnd.toISOString();

  let slots: readonly CalendarSlot[] = [];
  let sourceError = "";
  let sourceLabel = "Published timetable";
  let generatedAt = "";

  try {
    if (role === "learner") {
      const calendar = await loadLearnerCalendar(from, to);
      slots = calendar.slots.map(normaliseSlot);
      sourceLabel = "My enrolled timetable";
      generatedAt = calendar.generatedAt;
    } else if (institutionalHomeRoles.includes(role)) {
      const institutionId = resolution.session.membership.institutionIds[0];
      if (!institutionId) throw new Error("No active institution is available for this timetable");
      const calendar = await loadInstitutionTimetable(institutionId, from, to);
      slots = calendar.slots.map(normaliseSlot);
      sourceLabel = "Institution timetable";
      generatedAt = calendar.generatedAt;
    } else {
      sourceError = role === "guardian-sponsor"
        ? "Calendar disclosure is not yet available through the guardian summary permission."
        : "This workspace role does not yet have an authorised timetable read path.";
    }
  } catch {
    sourceError = "The published timetable could not be loaded. No synthetic schedule has been substituted.";
  }

  const orderedSlots = [...slots].sort((left, right) =>
    Date.parse(left.startsAt) - Date.parse(right.startsAt) || left.id.localeCompare(right.id),
  );
  const gridEvents: GridEvent[] = [];
  const outsideGrid: CalendarSlot[] = [];
  for (const slot of orderedSlots) {
    const placement = gridPlacement(slot, weekdayKeys, displayTimeZone);
    if (!placement) {
      outsideGrid.push(slot);
      continue;
    }
    gridEvents.push({ slot, ...placement, category: categoryForMode(slot.deliveryMode) });
  }

  const now = Date.now();
  const selected = orderedSlots.find((slot) => Date.parse(slot.endsAt) > now) ?? orderedSlots[0];
  const upcoming = orderedSlots.filter((slot) => Date.parse(slot.endsAt) > now).slice(0, 3);
  const uniqueCourses = new Set(orderedSlots.map((slot) => slot.courseRunId)).size;
  const deliveryCounts = {
    in_person: orderedSlots.filter((slot) => slot.deliveryMode === "in_person").length,
    online: orderedSlots.filter((slot) => slot.deliveryMode === "online").length,
    blended: orderedSlots.filter((slot) => slot.deliveryMode === "blended").length,
    workplace: orderedSlots.filter((slot) => slot.deliveryMode === "workplace").length,
  };
  const currentDateKey = dateKeyAt(new Date(), displayTimeZone);
  const dayHeadings = weekdays.map(dayHeading);

  return (
    <AppShell session={resolution.session} active="calendar">
      <section className="workspace calendar-workspace" aria-labelledby="calendar-title">
        <header className="calendar-heading">
          <div>
            <h1 id="calendar-title">{role === "registrar" ? "Timetable" : "Calendar"}</h1>
            <p>{sourceLabel}. Published scheduling evidence shown in {displayTimeZone}.</p>
          </div>
        </header>

        <div className="calendar-toolbar" aria-label="Calendar controls">
          <div className="calendar-period-controls">
            <Link href={weekHref(offset - 1)} aria-label="Previous week">‹</Link>
            <strong>{longDateLabel(weekdays[0]!)} - {longDateLabel(weekdays[4]!)}</strong>
            <Link href={weekHref(offset + 1)} aria-label="Next week">›</Link>
            {offset === 0 ? <span aria-current="date">Current week</span> : <Link href="/calendar">Today</Link>}
          </div>
          <div className="calendar-filter-controls" aria-label="Calendar source">
            <label><span>Source</span><select value={sourceLabel} disabled><option>{sourceLabel}</option></select></label>
            <label><span>Timezone</span><select value={displayTimeZone} disabled><option>{displayTimeZone}</option></select></label>
          </div>
        </div>

        <div className="calendar-layout">
          <div className="calendar-main">
            {sourceError ? (
              <section className="calendar-empty-context" role="status">
                <h2>Schedule unavailable</h2>
                <p>{sourceError}</p>
              </section>
            ) : null}
            <div className="calendar-grid" role="grid" aria-label="Weekly timetable">
              <div className="calendar-grid-corner">Time</div>
              {dayHeadings.map(([label, date], index) => {
                const key = weekdayKeys[index]!;
                return (
                  <div className="calendar-day-heading" key={key}>
                    <strong>{label}</strong>
                    <span>{date}</span>
                    {key === currentDateKey ? <i aria-label="Today">•</i> : null}
                  </div>
                );
              })}
              {times.map((time, row) => (
                <div className="calendar-time-row" key={time} style={{ gridRow: row + 2 }}>
                  <span>{time}</span>
                </div>
              ))}
              {Array.from({ length: 50 }, (_, index) => (
                <div
                  className="calendar-cell"
                  aria-hidden="true"
                  key={index}
                  style={{ gridColumn: (index % 5) + 2, gridRow: Math.floor(index / 5) + 2 }}
                />
              ))}
              {gridEvents.map((event) => (
                <article
                  className={`calendar-event ${event.category}${event.slot.id === selected?.id ? " selected" : ""}`}
                  key={event.slot.id}
                  style={{ gridColumn: event.day + 1, gridRow: `${event.row} / span ${event.span}` }}
                >
                  <div><i aria-hidden="true" /><strong>{event.slot.title}</strong></div>
                  <small>{event.slot.courseTitle}</small>
                  <span>{timeRangeLabel(event.slot, displayTimeZone)}</span>
                  <span>{locationLabel(event.slot)}</span>
                </article>
              ))}
            </div>
            <footer className="calendar-footer">
              <div className="calendar-legend">
                <span className="lecture">In person</span>
                <span className="live">Online</span>
                <span className="seminar">Blended</span>
                <span className="meeting">Workplace</span>
              </div>
              <div><span>All times in {displayTimeZone}</span><button type="button" disabled>Week</button></div>
            </footer>
          </div>

          <aside className="calendar-context" aria-label="Selected session details">
            {selected ? (
              <>
                <section className="session-summary">
                  <header>
                    <div><h2>{selected.title}</h2><span className="calendar-state-live">Scheduled</span></div>
                    <p>{selected.courseTitle}</p>
                  </header>
                  <dl>
                    <div><dt>Date</dt><dd>{dateLabelForSlot(selected, displayTimeZone)}</dd></div>
                    <div><dt>Time</dt><dd>{timeRangeLabel(selected, displayTimeZone)}</dd></div>
                    <div><dt>Location</dt><dd>{locationLabel(selected)}</dd></div>
                    <div><dt>Delivery</dt><dd>{modeLabel(selected.deliveryMode)}</dd></div>
                  </dl>
                  <div className="session-resource">
                    <div>
                      <strong>{selected.onlineJoinUrl ? "Online session link" : "Session access"}</strong>
                      <small>{selected.onlineJoinUrl ? "Published with the timetable" : "No online join link is published"}</small>
                    </div>
                    {selected.onlineJoinUrl ? <a href={selected.onlineJoinUrl} target="_blank" rel="noreferrer">Open session</a> : null}
                  </div>
                </section>

                <section className="session-agenda">
                  <nav><button className="active" type="button">Schedule evidence</button></nav>
                  <ol>
                    <li><time>Course</time><span>{selected.courseTitle}</span><small>{selected.courseRunId.slice(0, 8)}</small></li>
                    <li><time>Mode</time><span>{modeLabel(selected.deliveryMode)}</span><small>{selected.timezone}</small></li>
                    <li><time>Status</time><span>Scheduled</span><small>v{selected.version}</small></li>
                  </ol>
                </section>

                <section className="attendance-panel">
                  <header><div><h2>Attendance</h2><span>Separate evidence</span></div></header>
                  <p>Attendance records are governed separately and are not included in this timetable read. No attendance figures are inferred.</p>
                </section>
              </>
            ) : (
              <section className="calendar-empty-context">
                <h2>No published session selected</h2>
                <p>Session details appear here when an authorised timetable contains a scheduled session.</p>
              </section>
            )}
          </aside>
        </div>

        <div className="calendar-utilities">
          <section>
            <header><h2>Upcoming Sessions</h2></header>
            {upcoming.length ? (
              <ul>{upcoming.map((slot) => <li key={slot.id}><strong>{slot.title}</strong><span>{slot.courseTitle}</span><small>{dateLabelForSlot(slot, displayTimeZone)}, {timeLabel(slot.startsAt, displayTimeZone)}</small></li>)}</ul>
            ) : <p>No later sessions are published in this selected week.</p>}
          </section>
          <section>
            <header><h2>Outside Grid</h2></header>
            {outsideGrid.length ? (
              <ul>{outsideGrid.slice(0, 4).map((slot) => <li key={slot.id}><strong>{slot.title}</strong><span>{dateLabelForSlot(slot, displayTimeZone)}</span><small>{timeRangeLabel(slot, displayTimeZone)}</small></li>)}</ul>
            ) : <p>All published weekday sessions fit within the visible 08:00 to 18:00 grid.</p>}
          </section>
          <section>
            <header><h2>Week Coverage</h2></header>
            <strong className="calendar-trend-value">{orderedSlots.length}</strong>
            <span className="calendar-trend-delta">{uniqueCourses} course {uniqueCourses === 1 ? "run" : "runs"}</span>
            <div className="calendar-trend-line" aria-hidden="true" />
          </section>
          <section>
            <header><h2>Delivery Mix</h2></header>
            <ul>
              <li><strong>In person</strong><small>{deliveryCounts.in_person}</small></li>
              <li><strong>Online</strong><small>{deliveryCounts.online}</small></li>
              <li><strong>Blended</strong><small>{deliveryCounts.blended}</small></li>
              <li><strong>Workplace</strong><small>{deliveryCounts.workplace}</small></li>
            </ul>
            {generatedAt ? <small>Loaded {timeLabel(generatedAt, displayTimeZone)}</small> : null}
          </section>
        </div>
      </section>
    </AppShell>
  );
}
