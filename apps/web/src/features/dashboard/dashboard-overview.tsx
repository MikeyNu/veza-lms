import type { WorkspaceSession } from "@veza/contracts";
import { CourseGrid } from "./course-grid";
import { LearningOverview } from "./learning-overview";

function learnerClock(session: WorkspaceSession): { readonly date: string; readonly greeting: string } {
  const now = new Date();
  const date = new Intl.DateTimeFormat(session.tenant.locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: session.membership.timezone,
  }).format(now).toUpperCase();
  const hour = Number(new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    hourCycle: "h23",
    timeZone: session.membership.timezone,
  }).format(now));
  return { date, greeting: hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening" };
}

export function DashboardOverview({ session }: { session: WorkspaceSession }) {
  const clock = learnerClock(session);
  const firstName = session.principal.displayName?.trim().split(/\s+/)[0] ?? "Learner";
  return <div className="workspace">
    <header className="page-intro">
      <div><p className="eyebrow">{clock.date}</p><h1>{clock.greeting}, {firstName}.</h1><p>Continue from where you left off or see what needs attention today.</p></div>
      <div className="weather"><span>24°</span><small>Johannesburg<br/>Clear skies</small></div>
    </header>
    <LearningOverview/>
    <CourseGrid/>
  </div>;
}
