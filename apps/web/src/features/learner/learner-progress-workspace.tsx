import Link from "next/link";
import type { LearnerHome } from "@veza/contracts";

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return clamp(values.reduce((total, value) => total + value, 0) / values.length);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

export function LearnerProgressWorkspace({ home }: { home: LearnerHome }) {
  const progress = average(home.courses.map((course) => course.progressPercent));
  const completedLessons = home.courses.reduce((total, course) => total + course.completedLessons, 0);
  const totalLessons = home.courses.reduce((total, course) => total + course.totalLessons, 0);
  const dueWork = home.today.filter((item) => item.dueAt).length;

  return (
    <div className="vz-learning-page vz-learner-progress">
      <header className="vz-page-heading">
        <div>
          <p>PROGRESS</p>
          <h1>Your learning record</h1>
          <span>Published course completion and available due work across your current enrolments.</span>
        </div>
        <small>Updated {formatDate(home.generatedAt)}</small>
      </header>

      <section className="vz-progress-summary" aria-label="Learning progress summary">
        <article>
          <span>Average completion</span>
          <strong>{progress}%</strong>
          <small>Across {home.courses.length} current courses</small>
        </article>
        <article>
          <span>Lessons completed</span>
          <strong>{completedLessons}</strong>
          <small>Of {totalLessons} published lessons</small>
        </article>
        <article>
          <span>Due work available</span>
          <strong>{dueWork}</strong>
          <small>Calculated from currently available tasks</small>
        </article>
      </section>

      <section className="vz-progress-register">
        <header>
          <div><p>COURSES</p><h2>Completion by course</h2></div>
          <span>{home.courses.length} active</span>
        </header>
        <div className="vz-progress-course-list">
          {home.courses.map((course) => (
            <Link href={`/courses/${course.enrolmentId}`} className="vz-progress-course" key={course.enrolmentId}>
              <div>
                <small>{course.deliveryMode.replaceAll("_", " ")}</small>
                <h3>{course.courseTitle}</h3>
                <p>{course.nextLessonTitle ?? "Course home"}</p>
              </div>
              <div className="vz-progress-course-value">
                <strong>{clamp(course.progressPercent)}%</strong>
                <span>{course.completedLessons} of {course.totalLessons} lessons</span>
              </div>
              <div className="vz-course-progress" aria-hidden="true">
                <span style={{ width: `${clamp(course.progressPercent)}%` }} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <footer className="vz-progress-evidence">
        <strong>How progress is calculated</strong>
        <p>Only published lessons and recorded completion evidence are included. Unreleased marks and future activities are excluded.</p>
      </footer>
    </div>
  );
}
