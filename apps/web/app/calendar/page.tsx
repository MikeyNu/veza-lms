import { AppShell } from "../../src/components/app-shell";
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
  { id: "data-structures-mon", day: 1, row: 2, span: 2, category: "lecture", title: "Data Structures", code: "CS201 • L01", time: "09:00 – 10:30 AM", location: "Room B301" },
  { id: "statistics-lab", day: 2, row: 2, span: 2, category: "lab", title: "Statistics Lab", code: "MATH201 • L03", time: "09:00 – 11:00 AM", location: "Lab 2" },
  { id: "economics-tue", day: 2, row: 4, span: 1, category: "seminar", title: "Intro to Economics", code: "EC101 • L02", time: "11:00 AM – 12:00 PM", location: "Room A201" },
  { id: "design-thinking-wed", day: 3, row: 7, span: 2, category: "seminar", title: "Design Thinking", code: "UX205 • L01", time: "02:00 – 03:30 PM", location: "Design Studio" },
  { id: "faculty-meeting-wed", day: 3, row: 9, span: 2, category: "meeting", title: "Faculty Senate Meeting", time: "04:00 – 05:30 PM", location: "Senate Room" },
  { id: "data-structures-thu", day: 4, row: 2, span: 2, category: "lecture", title: "Data Structures", code: "CS201 • L01", time: "09:00 – 10:30 AM", location: "Room B301" },
  { id: "ai-webinar", day: 4, row: 8, span: 1, category: "live", title: "Future of AI", time: "03:00 – 04:00 PM", location: "Online" },
  { id: "economics-fri", day: 5, row: 4, span: 1, category: "seminar", title: "Intro to Economics", code: "EC101 • L02", time: "11:00 AM – 12:00 PM", location: "Room A201" },
];

const times = ["08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"] as const;
const days = [["Mon", "May 5"], ["Tue", "May 6"], ["Wed", "May 7"], ["Thu", "May 8"], ["Fri", "May 9"]] as const;
const attendanceRows = [["Aarav Mehta", "Present"], ["Neha Iyer", "Late"], ["Rohan Das", "Present"], ["Tanvi Kapoor", "Absent"], ["Vikram Singh", "Present"]] as const;

function demoMode(): boolean {
  return process.env.VEZA_DEMO_MODE === "true";
}

export default async function CalendarPage() {
  const resolution = await requireWorkspaceAccess("/calendar");
  const demo = demoMode();
  const events = demo ? demoEvents : [];
  const selected = events.find((event) => event.id === "statistics-lab");

  return (
    <AppShell session={resolution.session} active="calendar">
      <section className="workspace calendar-workspace" aria-labelledby="calendar-title">
        <header className="calendar-heading">
          <div><h1 id="calendar-title">Calendar</h1><p>Weekly schedule, live classes, and attendance hub.</p></div>
        </header>

        <div className="calendar-toolbar" aria-label="Calendar controls">
          <div className="calendar-period-controls"><button type="button" aria-label="Previous week">‹</button><strong>May 5 – May 9, 2025</strong><button type="button" aria-label="Next week">›</button><button type="button">Today</button></div>
          <div className="calendar-filter-controls"><label><span>School</span><select defaultValue="all"><option value="all">All Schools</option></select></label><label><span>Programme</span><select defaultValue="all"><option value="all">All Programmes</option></select></label><label><span>Faculty</span><select defaultValue="all"><option value="all">All Faculty</option></select></label><button type="button">Filter</button></div>
        </div>

        <div className="calendar-layout">
          <div className="calendar-main">
            <div className="calendar-grid" role="grid" aria-label="Weekly timetable">
              <div className="calendar-grid-corner">Time</div>
              {days.map(([label, date], index) => <div className="calendar-day-heading" key={label}><strong>{label}</strong><span>{date}</span>{index === 1 ? <i>6</i> : null}</div>)}
              {times.map((time, row) => <div className="calendar-time-row" key={time} style={{ gridRow: row + 2 }}><span>{time}</span></div>)}
              {Array.from({ length: 50 }, (_, index) => <div className="calendar-cell" aria-hidden="true" key={index} style={{ gridColumn: (index % 5) + 2, gridRow: Math.floor(index / 5) + 2 }} />)}
              {events.map((event) => <article className={`calendar-event ${event.category}${event.id === selected?.id ? " selected" : ""}`} key={event.id} style={{ gridColumn: event.day + 1, gridRow: `${event.row + 1} / span ${event.span}` }}><div><i aria-hidden="true" /><strong>{event.title}</strong></div>{event.code ? <small>{event.code}</small> : null}<span>{event.time}</span><span>{event.location}</span></article>)}
            </div>
            <footer className="calendar-footer"><div className="calendar-legend"><span className="lecture">Lecture</span><span className="lab">Lab</span><span className="seminar">Seminar</span><span className="meeting">Meeting</span><span className="live">Live / Webinar</span></div><div><span>All times in local time (GMT +5:30)</span><button type="button">Week</button></div></footer>
          </div>

          <aside className="calendar-context" aria-label="Selected session details">
            {selected ? <>
              <section className="session-summary"><header><div><h2>{selected.title}</h2><span className="calendar-state-live">Live Class</span></div><p>MATH201 • L03 • Statistics for Engineers</p></header><dl><div><dt>Date</dt><dd>Tue, May 6, 2025</dd></div><div><dt>Time</dt><dd>09:00 – 11:00 AM</dd></div><div><dt>Location</dt><dd>Lab 2</dd></div><div><dt>Capacity</dt><dd>42 / 60</dd></div></dl><div className="session-person"><span>PS</span><div><strong>Dr. Priya Sharma</strong><small>Professor</small></div></div><div className="session-resource"><div><strong>Lab Manual: Week 8</strong><small>Class resource</small></div><button type="button">View materials</button></div><div className="session-actions"><button className="primary" type="button" disabled>Join Live Class</button><button type="button" disabled>Class Actions</button></div></section>
              <section className="session-agenda"><nav><button className="active" type="button">Agenda</button><button type="button">Resources</button><button type="button">Class Insights</button></nav><ol>{[["09:00 AM","Lab Overview & Objectives","10 min"],["09:10 AM","Data Exploration in R","45 min"],["09:55 AM","Break","10 min"],["10:05 AM","Hypothesis Testing","35 min"],["10:40 AM","Lab Exercise","20 min"],["11:00 AM","Wrap-up & Q&A","10 min"]].map(([time,title,duration]) => <li key={`${time}-${title}`}><time>{time}</time><span>{title}</span><small>{duration}</small></li>)}</ol></section>
              <section className="attendance-panel"><header><div><h2>Attendance</h2><span>Live</span></div><div><button type="button" disabled>Mark all</button><button type="button" disabled>QR Code</button></div></header><div className="attendance-body"><div className="attendance-summary"><h3>Attendance Summary</h3><div className="attendance-donut"><strong>42</strong><span>Total</span></div><ul><li className="present">Present <strong>34 (81%)</strong></li><li className="late">Late <strong>5 (12%)</strong></li><li className="absent">Absent <strong>3 (7%)</strong></li></ul></div><div className="attendance-learners"><h3>Learner Attendance</h3><table><tbody>{attendanceRows.map(([name,status]) => <tr key={name}><td><span className="learner-avatar">{name.split(" ").map((part) => part[0]).join("")}</span>{name}</td><td><span className={`attendance-status ${status.toLowerCase()}`}>{status}</span></td></tr>)}</tbody></table><button className="attendance-view-all" type="button">View all 42 learners</button></div></div></section>
            </> : <section className="calendar-empty-context"><h2>No published session selected</h2><p>Session details, resources and attendance appear here after an authorised timetable is published.</p></section>}
          </aside>
        </div>

        <div className="calendar-utilities">
          <section><header><h2>Upcoming Deadlines</h2></header>{demo ? <ul><li><strong>Assignment 2: Linked Lists</strong><span>Data Structures (CS201)</span><small>May 8, 11:59 PM</small></li><li><strong>Lab Report: Week 7</strong><span>Statistics for Engineers (MATH201)</span><small>May 9, 5:00 PM</small></li></ul> : <p>No upcoming deadlines are available.</p>}</section>
          <section><header><h2>Schedule Alerts</h2></header>{demo ? <ul><li><strong>Room Conflict</strong><span>Lab 2 is double-booked on Thu, May 8</span><small>10:00 AM – 12:00 PM</small></li><li><strong>Faculty Unavailable</strong><span>Dr. Michael Lee is unavailable on Fri, May 9</span><small>02:00 – 04:00 PM</small></li></ul> : <p>No schedule alerts are active.</p>}</section>
          <section><header><h2>Attendance Trend</h2><small>This Week</small></header><strong className="calendar-trend-value">{demo ? "81%" : "—"}</strong><span className="calendar-trend-delta">{demo ? "▲ 6% vs last week" : "No attendance evidence"}</span><div className="calendar-trend-line" aria-hidden="true" /></section>
          <section><header><h2>Quick Actions</h2></header><div className="calendar-quick-actions"><button type="button" disabled>Create Live Class</button><button type="button" disabled>Upload Materials</button><button type="button" disabled>Take Attendance</button><button type="button" disabled>Send Announcement</button></div></section>
        </div>
      </section>
    </AppShell>
  );
}
