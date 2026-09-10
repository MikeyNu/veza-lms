import { AppShell } from "../../src/components/app-shell";
import { primaryRole } from "../../src/features/workspace/navigation";
import { requireWorkspaceAccess } from "../../src/server/require-workspace-access";

export const dynamic = "force-dynamic";

type CalendarEvent = Readonly<{
  id: string;
  day: number;
  row: number;
  span: number;
  category: "lecture" | "lab" | "seminar" | "meeting" | "live";
  title: string;
  code?: string;
  time: string;
  location: string;
}>;

const demoEvents: readonly CalendarEvent[] = [
  { id: "data-structures-mon", day: 1, row: 2, span: 2, category: "lecture", title: "Data Structures", code: "CS201 • L01", time: "09:00 to 10:30", location: "Room B301" },
  { id: "statistics-lab", day: 2, row: 2, span: 2, category: "lab", title: "Statistics Lab", code: "MATH201 • L03", time: "09:00 to 11:00", location: "Lab 2" },
  { id: "economics-tue", day: 2, row: 4, span: 1, category: "seminar", title: "Intro to Economics", code: "EC101 • L02", time: "11:00 to 12:00", location: "Room A201" },
  { id: "design-thinking-wed", day: 3, row: 7, span: 2, category: "seminar", title: "Design Thinking", code: "UX205 • L01", time: "14:00 to 15:30", location: "Design Studio" },
  { id: "faculty-meeting-wed", day: 3, row: 9, span: 2, category: "meeting", title: "Faculty Senate Meeting", time: "16:00 to 17:30", location: "Senate Room" },
  { id: "data-structures-thu", day: 4, row: 2, span: 2, category: "lecture", title: "Data Structures", code: "CS201 • L01", time: "09:00 to 10:30", location: "Room B301" },
  { id: "ai-webinar", day: 4, row: 8, span: 1, category: "live", title: "Future of AI", time: "15:00 to 16:00", location: "Online" },
  { id: "economics-fri", day: 5, row: 4, span: 1, category: "seminar", title: "Intro to Economics", code: "EC101 • L02", time: "11:00 to 12:00", location: "Room A201" },
];

const times = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00"] as const;

function demoMode(): boolean {
  return process.env.VEZA_DEMO_MODE === "true";
}

function weekDates(reference = new Date()): readonly Date[] {
  const start = new Date(Date.UTC(reference.getUTCFullYear(), reference.getUTCMonth(), reference.getUTCDate()));
  const weekday = start.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  start.setUTCDate(start.getUTCDate() + offset);
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return date;
  });
}

function dayLabel(date: Date): readonly [string, string] {
  return [
    new Intl.DateTimeFormat("en-ZA", { weekday: "short", timeZone: "UTC" }).format(date),
    new Intl.DateTimeFormat("en-ZA", { month: "short", day: "numeric", timeZone: "UTC" }).format(date),
  ];
}

function dateLabel(date: Date): string {
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

function isSameUtcDate(left: Date, right: Date): boolean {
  return left.getUTCFullYear() === right.getUTCFullYear()
    && left.getUTCMonth() === right.getUTCMonth()
    && left.getUTCDate() === right.getUTCDate();
}

export default async function CalendarPage() {
  const resolution = await requireWorkspaceAccess("/calendar");
  const role = primaryRole(resolution.session);
  const demo = demoMode();
  const learnerView = role === "learner";
  const availableEvents = demo ? demoEvents : [];
  const events = learnerView ? availableEvents.filter((event) => event.category !== "meeting") : availableEvents;
  const week = weekDates();
  const today = new Date();
  const scheduleManagers = ["tenant-owner", "institution-admin", "registrar", "course-manager", "instructor"];
  const canManageSchedule = scheduleManagers.includes(role);
  const sortedEvents = [...events].sort((a, b) => a.day - b.day || a.row - b.row);
  const liveCount = events.filter((event) => event.category === "live").length;
  const periodLabel = `${dateLabel(week[0]!)} to ${dateLabel(week[4]!)}`;

  if (role === "guardian-sponsor") {
    return (
      <AppShell session={resolution.session} active="calendar">
        <section className="workspace section-state" aria-labelledby="guardian-calendar-title">
          <div className="section-state-panel">
            <p className="eyebrow">LEARNER CALENDAR</p>
            <h1 id="guardian-calendar-title">No learner calendar is available</h1>
            <p>Schedule information appears only after the institution records an active learner relationship and allows calendar disclosure.</p>
            <div className="section-state-evidence">
              <span aria-hidden="true">i</span>
              <div>
                <strong>Privacy boundary preserved</strong>
                <small>No class, deadline or attendance information is disclosed without an authorised learner relationship.</small>
              </div>
            </div>
          </div>
        </section>
      </AppShell>
    );
  }

  return (
    <AppShell session={resolution.session} active="calendar">
      <section className={`workspace calendar-workspace${learnerView ? " calendar-workspace--learner" : ""}`} aria-labelledby="calendar-title">
        <header className="calendar-heading">
          <div>
            <p className="calendar-context-label">{learnerView ? "My week" : "Scheduling"}</p>
            <h1 id="calendar-title">{role === "registrar" ? "Timetable" : "Calendar"}</h1>
            <p>{learnerView ? "See what is scheduled next without losing sight of deadlines." : "Review the published week, session load and schedule exceptions from one working view."}</p>
          </div>
          <div className="calendar-week-summary" aria-label="Week summary">
            <div><span>Week</span><strong>{periodLabel}</strong></div>
            <div><span>Scheduled</span><strong>{events.length}</strong></div>
            <div><span>Live</span><strong>{liveCount}</strong></div>
          </div>
        </header>

        <div className="calendar-layout">
          <div className="calendar-main">
            <div className="calendar-grid" role="grid" aria-label={`Weekly timetable for ${periodLabel}`}>
              <div className="calendar-grid-corner">Time</div>
              {week.map((date) => {
                const [weekday, shortDate] = dayLabel(date);
                const current = isSameUtcDate(date, today);
                return (
                  <div className={`calendar-day-heading${current ? " is-today" : ""}`} key={date.toISOString()}>
                    <strong>{weekday}</strong>
                    <span>{shortDate}</span>
                    {current ? <i aria-label="Today">{date.getUTCDate()}</i> : null}
                  </div>
                );
              })}
              {times.map((time, row) => <div className="calendar-time-row" key={time} style={{ gridRow: row + 2 }}><span>{time}</span></div>)}
              {Array.from({ length: 50 }, (_, index) => <div className="calendar-cell" aria-hidden="true" key={index} style={{ gridColumn: (index % 5) + 2, gridRow: Math.floor(index / 5) + 2 }} />)}
              {events.map((event) => (
                <article
                  className={`calendar-event ${event.category}`}
                  key={event.id}
                  style={{ gridColumn: event.day + 1, gridRow: `${event.row + 1} / span ${event.span}` }}
                  aria-label={`${event.title}, ${event.time}, ${event.location}`}
                >
                  <div><i aria-hidden="true" /><strong>{event.title}</strong></div>
                  {event.code ? <small>{event.code}</small> : null}
                  <span>{event.time}</span>
                  <span>{event.location}</span>
                </article>
              ))}
            </div>
            <footer className="calendar-footer">
              <div className="calendar-legend" aria-label="Schedule categories">
                <span className="lecture">Lecture</span>
                <span className="lab">Lab</span>
                <span className="seminar">Seminar</span>
                <span className="meeting">Meeting</span>
                <span className="live">Live / Webinar</span>
              </div>
              <span>Times use {resolution.session.tenant.timezone}</span>
            </footer>
          </div>

          <aside className="calendar-context" aria-label={learnerView ? "Week priorities" : "Schedule context"}>
            <section className="calendar-side-section calendar-up-next">
              <header>
                <div>
                  <span>Next sessions</span>
                  <h2>{events.length ? "Coming up this week" : "No published sessions"}</h2>
                </div>
                <strong>{events.length}</strong>
              </header>
              {sortedEvents.length ? (
                <ol>
                  {sortedEvents.slice(0, 4).map((event) => (
                    <li key={event.id}>
                      <time>{dayLabel(week[event.day - 1]!)[0]} {event.time.split(" to ")[0]}</time>
                      <div><strong>{event.title}</strong><span>{event.location}</span></div>
                    </li>
                  ))}
                </ol>
              ) : <p>Published sessions will appear here when timetable evidence is available.</p>}
            </section>

            <section className="calendar-side-section">
              <header><div><span>Deadlines</span><h2>Upcoming work</h2></div></header>
              {demo ? (
                <ul className="calendar-priority-list">
                  <li><strong>Assignment 2: Linked Lists</strong><span>Data Structures (CS201)</span><small>Due Thursday, 23:59</small></li>
                  <li><strong>Lab Report: Week 7</strong><span>Statistics for Engineers (MATH201)</span><small>Due Friday, 17:00</small></li>
                </ul>
              ) : <p>No upcoming deadlines are available.</p>}
            </section>

            {canManageSchedule ? (
              <>
                <section className="calendar-side-section calendar-alerts">
                  <header><div><span>Exceptions</span><h2>Schedule alerts</h2></div><strong>{demo ? 2 : 0}</strong></header>
                  {demo ? (
                    <ul className="calendar-priority-list">
                      <li><strong>Room conflict</strong><span>Lab 2 is double-booked on Thursday</span><small>10:00 to 12:00</small></li>
                      <li><strong>Faculty unavailable</strong><span>Dr. Michael Lee is unavailable on Friday</span><small>14:00 to 16:00</small></li>
                    </ul>
                  ) : <p>No schedule alerts are active.</p>}
                </section>
                <section className="calendar-side-section calendar-attendance-evidence">
                  <header><div><span>Attendance evidence</span><h2>This week</h2></div></header>
                  <strong>{demo ? "81%" : "Unavailable"}</strong>
                  <p>{demo ? "34 present, 5 late and 3 absent across the current evidence snapshot." : "Attendance appears after authorised session records are published."}</p>
                </section>
              </>
            ) : null}
          </aside>
        </div>
      </section>
    </AppShell>
  );
}
