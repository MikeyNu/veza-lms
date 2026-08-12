import type { LearnerHome } from "@veza/contracts";
import { ButtonLink, EmptyState, Icon, ProgressState } from "@veza/ui";
import styles from "./learner-today-workspace.module.css";

type LearnerHomeItem = LearnerHome["today"][number];
type LearnerCourse = LearnerHome["courses"][number];

function safeDate(value: string | undefined): { readonly label: string; readonly dateTime?: string } {
  if (!value) return { label: "No date" };
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { label: "Date unavailable" };
  return {
    label: new Intl.DateTimeFormat("en-ZA", {
      dateStyle: "medium",
      ...(value.includes("T") ? { timeStyle: "short" as const } : {}),
      timeZone: "Africa/Johannesburg",
    }).format(date),
    dateTime: date.toISOString(),
  };
}

function internalHref(value: string): string {
  return value.startsWith("/") && !value.startsWith("//") ? value : "/learning";
}

function focusAction(item: LearnerHomeItem): string {
  switch (item.kind) {
    case "assignment": return "Open assignment";
    case "event": return "View event";
    case "announcement": return "Read announcement";
    default: return "Continue lesson";
  }
}

function focusIcon(item: LearnerHomeItem): "file" | "calendar" | "message" | "play" {
  switch (item.kind) {
    case "assignment": return "file";
    case "event": return "calendar";
    case "announcement": return "message";
    default: return "play";
  }
}

function matchingCourse(item: LearnerHomeItem | undefined, courses: readonly LearnerCourse[]): LearnerCourse | undefined {
  if (!item) return undefined;
  return courses.find((course) => course.courseRunId === item.courseRunId);
}

function UpcomingItem({ item }: { readonly item: LearnerHomeItem }) {
  const date = safeDate(item.dueAt ?? item.startsAt);
  return (
    <li className={styles.upcomingItem}>
      <div>
        <span className={styles.itemKind}>{item.kind.replaceAll("_", " ")}</span>
        <strong>{item.title}</strong>
        <small>{item.courseTitle}</small>
      </div>
      <div className={styles.upcomingMeta}>
        <time {...(date.dateTime ? { dateTime: date.dateTime } : {})}>{date.label}</time>
        <ButtonLink variant="quiet" size="small" href={internalHref(item.href)} aria-label={`Open ${item.title}`}>
          Open
        </ButtonLink>
      </div>
    </li>
  );
}

function CourseRow({ course }: { readonly course: LearnerCourse }) {
  const endDate = safeDate(course.endsOn);
  return (
    <li className={styles.courseRow}>
      <div className={styles.courseIdentity}>
        <span className={styles.courseMode}>{course.deliveryMode.replaceAll("_", " ")}</span>
        <strong>{course.courseTitle}</strong>
        <small>{course.nextLessonTitle ?? "Course overview"}</small>
      </div>
      <ProgressState
        className={styles.courseProgress}
        label="Progress"
        value={course.progressPercent}
        detail={`${course.completedLessons} of ${course.totalLessons} lessons`}
      />
      <div className={styles.courseEnd}>
        <span>Ends</span>
        <time {...(endDate.dateTime ? { dateTime: endDate.dateTime } : {})}>{endDate.label}</time>
      </div>
      <ButtonLink variant="secondary" size="small" href={`/courses/${course.enrolmentId}`} trailingIcon={<Icon name="arrow-right" size="small" />}>
        Open course
      </ButtonLink>
    </li>
  );
}

export function LearnerTodayWorkspace({ home }: { readonly home: LearnerHome }) {
  const focus = home.today[0];
  const focusCourse = matchingCourse(focus, home.courses);
  const updated = safeDate(home.generatedAt);
  const upcoming = home.today.slice(1, 6);

  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.context}>My learning</p>
          <h1>Continue your learning</h1>
          <p>Resume the next available activity, then review upcoming work and current course progress.</p>
        </div>
        <div className={styles.headingActions}>
          <small>Updated <time {...(updated.dateTime ? { dateTime: updated.dateTime } : {})}>{updated.label}</time></small>
          <ButtonLink variant="secondary" size="small" href="/calendar" leadingIcon={<Icon name="calendar" size="small" />}>
            View calendar
          </ButtonLink>
        </div>
      </header>

      <section className={styles.priorityGrid} aria-labelledby="learner-priority-title">
        <div className={styles.priority}>
          <p className={styles.sectionLabel}>Next activity</p>
          {focus ? (
            <>
              <span className={styles.focusCourse}>{focus.courseTitle}</span>
              <h2 id="learner-priority-title">{focus.title}</h2>
              <p>Open the highest-priority available item without losing the published course context or recorded progress.</p>
              {focusCourse ? (
                <ProgressState
                  className={styles.focusProgress}
                  label={focusCourse.courseTitle}
                  value={focusCourse.progressPercent}
                  detail={`${focusCourse.completedLessons} of ${focusCourse.totalLessons} lessons completed`}
                />
              ) : null}
              <div className={styles.priorityActions}>
                <ButtonLink href={internalHref(focus.href)} leadingIcon={<Icon name={focusIcon(focus)} size="small" />}>
                  {focusAction(focus)}
                </ButtonLink>
                {focusCourse ? (
                  <ButtonLink variant="secondary" href={`/courses/${focusCourse.enrolmentId}`}>
                    Course overview
                  </ButtonLink>
                ) : null}
              </div>
            </>
          ) : (
            <EmptyState
              compact
              title="Nothing needs your attention"
              description="There is no available lesson, assignment, event or announcement in your current queue."
            />
          )}
        </div>

        <aside className={styles.upcoming} aria-labelledby="learner-upcoming-title">
          <header>
            <div>
              <p className={styles.sectionLabel}>Schedule</p>
              <h2 id="learner-upcoming-title">Upcoming</h2>
            </div>
            <ButtonLink variant="quiet" size="small" href="/calendar">View all</ButtonLink>
          </header>
          {upcoming.length ? (
            <ul>{upcoming.map((item) => <UpcomingItem key={`${item.kind}-${item.id}`} item={item} />)}</ul>
          ) : (
            <EmptyState compact title="No additional items" description="Your queue is clear after the current activity." />
          )}
        </aside>
      </section>

      <section className={styles.courses} aria-labelledby="learner-courses-title">
        <header>
          <div>
            <p className={styles.sectionLabel}>Current enrolments</p>
            <h2 id="learner-courses-title">Your courses</h2>
            <p>Progress and the next available lesson for each active enrolment.</p>
          </div>
          <span>{home.courses.length} active</span>
        </header>
        {home.courses.length ? (
          <ul>{home.courses.map((course) => <CourseRow key={course.enrolmentId} course={course} />)}</ul>
        ) : (
          <EmptyState title="No active courses" description="Courses appear here after an active enrolment is available to this membership." />
        )}
      </section>
    </div>
  );
}
