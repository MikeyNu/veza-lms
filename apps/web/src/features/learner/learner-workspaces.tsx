"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { LearnerCourseRoom, LearnerHome, StudioBlock } from "@veza/contracts";

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
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: value.includes("T") ? "short" : undefined, timeZone: "Africa/Johannesburg" }).format(new Date(value));
}

export function LearnerTodayWorkspace({ home }: { home: LearnerHome }) {
  return (
    <div className="vz-learning-page vz-learner-home">
      <header className="vz-page-heading">
        <div><p>TODAY</p><h1>Keep moving</h1><span>Your next actions are calculated from current enrolments, published content and due work.</span></div>
        <small>Updated {formatDate(home.generatedAt)}</small>
      </header>
      <section className="vz-next-grid">
        <article className="vz-primary-next">
          <span>Next action</span>
          {home.today[0] ? <><h2>{home.today[0].title}</h2><p>{home.today[0].courseTitle}</p><Link href={home.today[0].href}>Continue</Link></> : <><h2>You are up to date</h2><p>No available lesson, event or due activity requires attention.</p></>}
        </article>
        <div className="vz-today-list">
          {home.today.slice(1, 6).map((item) => <Link key={`${item.kind}-${item.id}`} href={item.href}><span>{item.kind}</span><strong>{item.title}</strong><small>{item.courseTitle} · {formatDate(item.dueAt ?? item.startsAt)}</small></Link>)}
        </div>
      </section>
      <section className="vz-course-register">
        <header><div><p>COURSES</p><h2>Your current learning</h2></div><span>{home.courses.length}</span></header>
        <div className="vz-course-cards">
          {home.courses.map((course) => <Link href={`/courses/${course.enrolmentId}`} key={course.enrolmentId}>
            <div className="vz-course-progress"><span style={{ width: `${Math.max(0, Math.min(100, course.progressPercent))}%` }} /></div>
            <small>{course.deliveryMode.replaceAll("_", " ")}</small>
            <h3>{course.courseTitle}</h3>
            <p>{course.nextLessonTitle ?? "Course home"}</p>
            <footer><span>{course.completedLessons} of {course.totalLessons} lessons</span><strong>{course.progressPercent}%</strong></footer>
          </Link>)}
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

export function LearnerCourseWorkspace({ room, initialLowBandwidth }: { room: LearnerCourseRoom; initialLowBandwidth: boolean }) {
  const router = useRouter();
  const lessons = useMemo(() => room.modules.flatMap((module) => module.lessons), [room.modules]);
  const firstOpen = lessons.find((lesson) => !lesson.completed) ?? lessons[0];
  const [lessonId, setLessonId] = useState(firstOpen?.id ?? "");
  const [lowBandwidth, setLowBandwidth] = useState(initialLowBandwidth);
  const [message, setMessage] = useState("");
  const lesson = lessons.find((item) => item.id === lessonId) ?? firstOpen;

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
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Bookmark failed"); }
  }

  async function prepareOffline() {
    try {
      await post("offline", { enrolmentId: room.enrolmentId, publicationSnapshotId: room.publicationSnapshotId, lowBandwidth, requestedAt: new Date().toISOString() });
      setMessage("Offline manifest prepared for this publication snapshot.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Offline preparation failed"); }
  }

  return <div className="vz-learning-page vz-course-room">
    <header className="vz-page-heading"><div><p>COURSE ROOM</p><h1>{room.courseTitle}</h1><span>{room.completedLessons} of {room.totalLessons} lessons complete · Evidence refreshed {formatDate(room.dataFreshness)}</span></div><div className="vz-room-tools"><label><input type="checkbox" checked={lowBandwidth} onChange={(event) => setLowBandwidth(event.target.checked)} /> Low bandwidth</label><button type="button" onClick={prepareOffline}>Prepare offline</button></div></header>
    <section className="vz-course-shell">
      <nav className="vz-module-rail" aria-label="Course modules">
        {room.modules.map((module) => <section key={module.id}><header><strong>{module.title}</strong><span>{module.completionPercent}%</span></header>{module.lessons.map((item) => <button type="button" className={item.id === lesson?.id ? "active" : ""} onClick={() => setLessonId(item.id)} key={item.id}><span>{item.completed ? "✓" : item.sequenceNumber}</span><div><strong>{item.title}</strong><small>{item.estimatedMinutes ? `${item.estimatedMinutes} min` : "Lesson"}</small></div></button>)}</section>)}
      </nav>
      <main className="vz-lesson-player">
        {lesson ? <><header><div><small>LESSON {lesson.sequenceNumber}</small><h2>{lesson.title}</h2><p>{lesson.summary}</p></div><button type="button" onClick={toggleBookmark}>{lesson.bookmarked ? "Bookmarked" : "Bookmark"}</button></header><article className="vz-lesson-content">{lesson.blocks.map((block) => <BlockView key={block.id} block={block} lowBandwidth={lowBandwidth} />)}</article><footer><button type="button" onClick={completeLesson} disabled={lesson.completed}>{lesson.completed ? "Completed" : "Mark complete"}</button><small>{message}</small></footer></> : <div className="vz-empty-state"><strong>No available lesson</strong><p>Future or hidden lessons remain protected until their availability rules pass.</p></div>}
      </main>
      <aside className="vz-course-context"><section><span>Progress</span><strong>{room.progressPercent}%</strong><div className="vz-course-progress"><span style={{ width: `${room.progressPercent}%` }} /></div></section><section><span>Announcements</span>{room.announcements.slice(0, 3).map((item, index) => <p key={String(item.id ?? index)}>{String(item.title ?? item.body ?? "Announcement")}</p>)}</section><section><span>Discussions</span><strong>{room.discussions.length}</strong><small>Current course threads</small></section></aside>
    </section>
  </div>;
}
