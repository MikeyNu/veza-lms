import { CourseGrid } from "./course-grid";
import { LearningOverview } from "./learning-overview";

export function DashboardOverview() {
  return <div className="workspace">
    <section className="welcome">
      <div><p className="eyebrow">TUESDAY, 4 AUGUST</p><h1>Good evening, Michael.</h1><p>Continue where you left off or prepare for what is coming next.</p></div>
      <div className="streak"><span>✦</span><div><strong>12 day streak</strong><small>Your longest this term</small></div></div>
    </section>
    <LearningOverview/>
    <CourseGrid/>
  </div>;
}
