import type { WorkspaceSession } from "@veza/contracts";
import { Icon } from "../../components/icon";
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

  return (
    <div className="workspace">
      <section className="welcome">
        <div>
          <p className="eyebrow">{clock.date}</p>
          <h1>{clock.greeting}, {firstName}.</h1>
          <p>Continue the most important learning task, then review what needs attention today.</p>
        </div>
        <div className="learning-rhythm">
          <span><Icon name="check" /></span>
          <div>
            <strong>12 active learning days</strong>
            <small>Days with at least one completed learning activity this term.</small>
          </div>
        </div>
      </section>
      <LearningOverview />
      <CourseGrid />
    </div>
  );
}
