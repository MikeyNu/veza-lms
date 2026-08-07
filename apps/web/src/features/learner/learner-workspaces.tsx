"use client";

import type { LearnerCourseRoom, LearnerHome, StudioBlock } from "@veza/contracts";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Icon } from "../../components/icon";

async function post(operation: string, input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/learner/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof body.message === "string" ? body.message : "Learner operation failed");
  return body;
}

function formatDate(value?: string): string {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: value.includes("T") ? "short" : undefined,
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function internalRoute(value: string): Route {
  return value.startsWith("/") && !value.startsWith("//") ? value as Route : "/";
}

function cappedProgress(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function LearnerTodayWorkspace({ home }: { home: LearnerHome }) {
  const focus = home.today[0];
  const primaryCourse = home.courses[0];

  return (
    <div className="vz-learning-page vz-learner-home vz-learner-home-ref">
      <header className="vz-learner-welcome">
        <div>
          <p>MY LEARNING</p>
          <h1>Welcome back</h1>
          <span>Pick up where you left off or review what needs your attention next.</span>
        </div>
        <div className="vz-learner-welcome-actions">
          <small>Updated {formatDate(home.generatedAt)}</small>
          <Link href="/calendar"><Icon name="calendar" /> View calendar</Link>
        </div>
      </header>

      <section className="vz-learning-focus-grid" aria-label="Learning priorities">
        <article className="vz-learning-feature">
          <div className="vz-learning-feature-copy">
            <div className="vz-learning-feature-meta">
              <span>CONTINUE LEARNING</span>
              {primaryCourse ? <strong>{primaryCourse.progressPercent}% complete</strong> : null}
            </div>
            {focus ? (
              <>
                <p>{focus.courseTitle}</p>
                <h2>{focus.title}</h2>
                <span className="vz-learning-feature-support">Continue your current lesson with your progress and completion evidence preserved.</span>
                {primaryCourse ? (
                  <div className="vz-learning-feature-progress" aria-label={`${primaryCourse.progressPercent}% course progress`}>
                    <span style={{ width: `${cappedProgress(primaryCourse.progressPercent)}%` }} />
                  </div>
                ) : null}
                <div className="vz-learning-feature-actions">
                  <Link className="vz-learning-primary-action" href={internalRoute(focus.href)}><Icon name="play" /> Continue lesson</Link>
                  {primaryCourse ? <Link className="vz-learning-secondary-action" href={`/courses/${primaryCourse.enrolmentId}` as Route}>Course overview <Icon name="chevron-right" /></Link> : null}
                </div>
              </>
            ) : (
              <>
                <p>Learning queue</p>
                <h2>You are up to date</h2>
                <span className="vz-learning-feature-support">No available lesson, event or due activity currently needs attention.</span>
              </>
            )}
          </div>
          <div className="vz-learning-feature-art" aria-hidden="true">
            <div className="vz-art-window">
              <span /><span /><span />
              <div className="vz-art-chart">
                <i /><i /><i /><i /><i />
              </div>
              <div className="vz-art-pulse"><b>62</b><small>progress</small></div>
            </div>
          </div>
        </article>

        <aside className="vz-learning-up-next">
          <header>
            <div><p>UP NEXT</p><h2>Today and upcoming</h2></div>
            <Link href="/calendar">View all <Icon name="arrow" /></Link>
          </header>
          <div>
            {home.today.slice(1, 6).map((item) => (
              <Link key={`${item.kind}-${item.id}`} href={internalRoute(item.href)}>
                <span className={`vz-learning-event-icon ${item.kind}`}><Icon name={item.kind === "assignment" ? "file" : item.kind === "lesson" ? "book" : "calendar"} /></span>
                <div>
                  <small>{item.kind.replaceAll("_", " ")}</small>
                  <strong>{item.title}</strong>
                  <p>{item.courseTitle}</p>
                </div>
                <time>{formatDate(item.dueAt ?? item.startsAt)}</time>
              </Link>
            ))}
            {!home.today.slice(1, 6).length ? <div className="vz-learning-up-next-empty"><strong>Nothing else due</strong><span>Your learning queue is clear after the current activity.</span></div> : null}
          </div>
        </aside>
      </section>

      <section className="vz-course-register vz-course-register-ref">
        <header>
          <div><p>YOUR COURSES</p><h2>Current learning</h2><span>Active enrolments and the next available lesson in each course.</span></div>
          <strong>{home.courses.length}</strong>
        </header>
        <div className="vz-course-cards">
          {home.courses.map((course, index) => (
            <Link href={`/courses/${course.enrolmentId}` as Route} key={course.enrolmentId} className="vz-course-card-ref">
              <div className="vz-course-card-visual" aria-hidden="true"><span>{String(index + 1).padStart(2, "0")}</span><Icon name="book" /></div>
              <div className="vz-course-card-body">
                <small>{course.deliveryMode.replaceAll("_", " ")}</small>
                <h3>{course.courseTitle}</h3>
                <p>{course.nextLessonTitle ?? "Course home"}</p>
                <div className="vz-course-progress"><span style={{ width: `${cappedProgress(course.progressPercent)}%` }} /></div>
                <footer><span>{course.completedLessons} of {course.totalLessons} lessons</span><strong>{course.progressPercent}%</strong></footer>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function text(data: Readonly<Record<string, unknown>>, key: string): string {
  return typeof data[key] === "string" ? String(data[key]) : "";
}

function BlockView({ block, lowBandwidth }: { block: StudioBlock; lowBandwidth: boolean }) {
  const children = block.children?.map((child) => <BlockView key={child.id} block={child} lowBandwidth={lowBandwidth} />);
  if (block.type === "heading") return <h2 id={block.id}>{text(block.data, "text")}</h2>;
  if (block.type === "paragraph") return <p>{text(block.data, "text")}</p>;
  if (block.type === "callout") return <aside className="vz-lesson-callout"><strong>{text(block.data, "title")}</strong><p>{text(block.data, "text")}</p></aside>;
  if (block.type === "quote") return <blockquote>{text(block.data, "text")}<cite>{text(block.data, "attribution")}</cite></blockquote>;
  if (block.type === "image") return <figure>{lowBandwidth ? <div className="vz-media-placeholder">Image withheld in low-bandwidth mode</div> : <img src={text(block.data, "url")} alt={text(block.data, "alt")} loading="lazy" />}<figcaption>{text(block.data, "caption")}</figcaption></figure>;
  if (["video", "audio"].includes(block.type)) return <figure>{lowBandwidth ? <div className="vz-media-placeholder">Media withheld in low-bandwidth mode. Transcript remains available.</div> : block.type === "video" ? <video controls preload="metadata" src={text(block.data, "url")} /> : <audio controls preload="metadata" src={text(block.data, "url")} />}<figcaption>{text(block.data, "caption") || text(block.data, "transcript")}</figcaption></figure>;
  if (block.type === "code") return <pre><code>{text(block.data, "code")}</code></pre>;
  if (block.type === "equation") return <div className="vz-equation" aria-label={text(block.data, "accessibleText")}>{text(block.data, "latex")}</div>;
  if (block.type === "divider") return <hr />;
  if (["columns", "accordion", "tabs"].includes(block.type)) return <section className={`vz-block-${block.type}`}>{children}</section>;
  if (["quiz", "activity", "outcome"].includes(block.type)) return <section className="vz-activity-block"><span>{block.type}</span><strong>{text(block.data, "title")}</strong><p>{text(block.data, "instructions") || text(block.data, "text")}</p></section>;
  return <section>{children ?? text(block.data, "text")}</section>;
}

type LessonTab = "overview" | "resources" | "discussion";

export function LearnerCourseWorkspace({ room, initialLowBandwidth }: { room: LearnerCourseRoom; initialLowBandwidth: boolean }) {
  const router = useRouter();
  const lessons = useMemo(() => room.modules.flatMap((module) => module.lessons), [room.modules]);
  const firstOpen = lessons.find((lesson) => !lesson.completed) ?? lessons[0];
  const [lessonId, setLessonId] = useState(firstOpen?.id ?? "");
  const [lowBandwidth, setLowBandwidth] = useState(initialLowBandwidth);
  const [message, setMessage] = useState("");
  const [tab, setTab] = useState<LessonTab>("overview");
  const lesson = lessons.find((item) => item.id === lessonId) ?? firstOpen;
  const lessonIndex = lesson ? lessons.findIndex((item) => item.id === lesson.id) : -1;
  const nextLesson = lessonIndex >= 0 ? lessons[lessonIndex + 1] : undefined;
  const resources = lesson?.blocks.filter((block) => ["image", "video", "audio", "file"].includes(block.type)) ?? [];

  async function completeLesson() {
    if (!lesson) return;
    setMessage("Saving completion evidence...");
    try {
      await post("evidence", { enrolmentId: room.enrolmentId, lessonId: lesson.id, evidenceType: "lesson-completed", evidence: { publicationSnapshotId: room.publicationSnapshotId, completedAt: new Date().toISOString() } });
      setMessage("Completion recorded from authoritative evidence.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Completion failed"); }
  }

  async function toggleBookmark() {
    if (!lesson) return;
    try {
      await post("bookmark", { enrolmentId: room.enrolmentId, lessonId: lesson.id, note: lesson.bookmarked ? "Remove bookmark" : "Saved from lesson player" });
      setMessage(lesson.bookmarked ? "Bookmark removal requested." : "Lesson bookmarked.");
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Bookmark failed"); }
  }

  async function prepareOffline() {
    try {
      await post("offline", { enrolmentId: room.enrolmentId, publicationSnapshotId: room.publicationSnapshotId, lowBandwidth, requestedAt: new Date().toISOString() });
      setMessage("Offline manifest prepared for this publication snapshot.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Offline preparation failed"); }
  }

  async function shareCourse() {
    const shareData = { title: room.courseTitle, text: lesson?.title ?? room.courseTitle, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(window.location.href);
        setMessage("Course link copied.");
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setMessage("Unable to share this course right now.");
    }
  }

  return (
    <div className="vz-learning-page vz-course-room vz-course-room-ref">
      <div className="vz-course-back-row">
        <Link href="/learning"><Icon name="chevron-left" /> Back to My Learning</Link>
        <button type="button" onClick={shareCourse}><Icon name="share" /> Share</button>
      </div>

      <header className="vz-course-context-bar">
        <div className="vz-course-context-title">
          <span aria-hidden="true"><Icon name="book" /></span>
          <div><h1>{room.courseTitle}</h1><p>{room.totalLessons} lessons · {room.completedLessons} completed</p></div>
        </div>
        <div className="vz-course-context-progress">
          <label>Course progress <strong>{room.progressPercent}%</strong></label>
          <div><span style={{ width: `${cappedProgress(room.progressPercent)}%` }} /></div>
        </div>
        <button className="vz-course-complete" type="button" onClick={completeLesson} disabled={!lesson || lesson.completed}><Icon name="check-circle" /> {lesson?.completed ? "Completed" : "Mark complete"}</button>
      </header>

      <section className="vz-course-shell vz-course-shell-ref">
        <nav className="vz-module-rail vz-module-rail-ref" aria-label="Course outline">
          <header className="vz-outline-heading"><div><strong>Course outline</strong><small>{room.totalLessons} lessons</small></div></header>
          {room.modules.map((module) => (
            <section key={module.id}>
              <header><strong>{module.title}</strong><span>{module.completionPercent}%</span></header>
              {module.lessons.map((item) => (
                <button type="button" className={item.id === lesson?.id ? "active" : ""} onClick={() => { setLessonId(item.id); setTab("overview"); }} key={item.id}>
                  <span className={item.completed ? "complete" : ""}>{item.completed ? <Icon name="check-circle" /> : item.sequenceNumber}</span>
                  <div><strong>{item.title}</strong><small>{item.estimatedMinutes ? `${item.estimatedMinutes} min` : "Lesson"}</small></div>
                </button>
              ))}
            </section>
          ))}
        </nav>

        <main className="vz-lesson-player vz-lesson-player-ref">
          {lesson ? (
            <>
              <header className="vz-lesson-heading-ref">
                <div><small>LESSON {lesson.sequenceNumber}</small><h2>{lesson.title}</h2><p>{lesson.summary}</p></div>
                <button className={lesson.bookmarked ? "active" : ""} type="button" onClick={toggleBookmark}><Icon name="bookmark" /> {lesson.bookmarked ? "Saved" : "Save"}</button>
              </header>

              <div className="vz-lesson-hero-ref">
                <div className="vz-lesson-hero-grid" aria-hidden="true"><span /><span /><span /><span /></div>
                <div><small>LEARNING OBJECTIVE</small><strong>{lesson.title}</strong><p>{lesson.summary || "Work through this lesson and record authoritative completion evidence when finished."}</p></div>
              </div>

              <nav className="vz-lesson-tabs" aria-label="Lesson views">
                <button className={tab === "overview" ? "active" : ""} type="button" onClick={() => setTab("overview")}>Overview</button>
                <button className={tab === "resources" ? "active" : ""} type="button" onClick={() => setTab("resources")}>Resources <span>{resources.length}</span></button>
                <button className={tab === "discussion" ? "active" : ""} type="button" onClick={() => setTab("discussion")}>Discussion <span>{room.discussions.length}</span></button>
              </nav>

              {tab === "overview" ? <article className="vz-lesson-content vz-lesson-content-ref">{lesson.blocks.map((block) => <BlockView key={block.id} block={block} lowBandwidth={lowBandwidth} />)}</article> : null}
              {tab === "resources" ? <section className="vz-lesson-resources-ref">
                {resources.length ? resources.map((resource) => <article key={resource.id}><span><Icon name={resource.type === "video" ? "video" : "file"} /></span><div><strong>{text(resource.data, "title") || text(resource.data, "caption") || `${resource.type} resource`}</strong><small>{resource.type}</small></div><Icon name="download" /></article>) : <div className="vz-course-tab-empty"><strong>No lesson resources</strong><p>Resources attached to this published lesson will appear here.</p></div>}
              </section> : null}
              {tab === "discussion" ? <section className="vz-lesson-discussion-ref">
                {room.discussions.length ? room.discussions.map((item, index) => <article key={String(item.id ?? index)}><span>{String(index + 1).padStart(2, "0")}</span><div><strong>{String(item.title ?? "Course discussion")}</strong><small>{String(item.replyCount ?? 0)} replies</small></div><Icon name="chevron-right" /></article>) : <div className="vz-course-tab-empty"><strong>No active discussion</strong><p>Course discussion threads will appear here when available.</p></div>}
              </section> : null}

              <footer className="vz-lesson-footer-ref">
                <small role="status">{message}</small>
                <div>
                  <label><input type="checkbox" checked={lowBandwidth} onChange={(event) => setLowBandwidth(event.target.checked)} /> Low bandwidth</label>
                  <button type="button" onClick={prepareOffline}><Icon name="download" /> Prepare offline</button>
                  <button className="primary" type="button" onClick={completeLesson} disabled={lesson.completed}><Icon name="check-circle" /> {lesson.completed ? "Completed" : "Mark complete"}</button>
                </div>
              </footer>
            </>
          ) : <div className="vz-empty-state"><strong>No available lesson</strong><p>Future or hidden lessons remain protected until their availability rules pass.</p></div>}
        </main>

        <aside className="vz-course-context vz-course-context-ref">
          <section className="vz-course-progress-card">
            <header><strong>Your progress</strong></header>
            <div className="vz-course-ring" style={{ "--course-progress": `${cappedProgress(room.progressPercent) * 3.6}deg` } as React.CSSProperties}><div><strong>{room.progressPercent}%</strong><small>Completed</small></div></div>
            <dl><div><dt>Lessons</dt><dd>{room.completedLessons} / {room.totalLessons}</dd></div><div><dt>Remaining</dt><dd>{Math.max(0, room.totalLessons - room.completedLessons)}</dd></div></dl>
          </section>

          {room.announcements.length ? <section className="vz-course-side-card"><header><strong>Announcements</strong><Link href="/communicate">View all</Link></header>{room.announcements.slice(0, 2).map((item, index) => <article key={String(item.id ?? index)}><span><Icon name="bell" /></span><div><strong>{String(item.title ?? "Course update")}</strong><small>{String(item.body ?? "")}</small></div></article>)}</section> : null}

          <section className="vz-course-side-card"><header><strong>Discussion</strong><span>{room.discussions.length}</span></header>{room.discussions.slice(0, 2).map((item, index) => <article key={String(item.id ?? index)}><span><Icon name="message" /></span><div><strong>{String(item.title ?? "Course discussion")}</strong><small>{String(item.replyCount ?? 0)} replies</small></div></article>)}</section>

          {nextLesson ? <section className="vz-course-up-next-card"><small>UP NEXT</small><strong>{nextLesson.title}</strong><span>{nextLesson.estimatedMinutes ? `${nextLesson.estimatedMinutes} min` : "Next lesson"}</span><button type="button" onClick={() => { setLessonId(nextLesson.id); setTab("overview"); }}>Continue <Icon name="chevron-right" /></button></section> : null}
        </aside>
      </section>
    </div>
  );
}
