"use client";

import type { LearnerCourseRoom, LearnerLessonView, StudioBlock } from "@veza/contracts";
import {
  Button,
  ButtonLink,
  Checkbox,
  EmptyState,
  Icon,
  ProgressState,
  Tabs,
} from "@veza/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { postLearnerCommand } from "./learner-client-request";
import styles from "./learner-course-workspace.module.css";

function text(record: Readonly<Record<string, unknown>>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

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

function safeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function blockChildren(block: StudioBlock): readonly StudioBlock[] {
  return Array.isArray(block.children) ? block.children : [];
}

function headingLevel(record: Readonly<Record<string, unknown>>): 2 | 3 | 4 {
  const value = record.level;
  return value === 3 || value === 4 ? value : 2;
}

function ResourceBlock({ block }: { readonly block: StudioBlock }) {
  const label = text(block.data, "label") ?? text(block.data, "title") ?? `${block.type} resource`;
  const url = safeUrl(text(block.data, "url"));
  return (
    <li className={styles.resourceRow}>
      <div>
        <span>{block.type}</span>
        <strong>{label}</strong>
      </div>
      {url ? (
        <ButtonLink variant="quiet" size="small" href={url} target={url.startsWith("/") ? undefined : "_blank"} rel={url.startsWith("/") ? undefined : "noreferrer"} trailingIcon={<Icon name="external-link" size="small" />}>
          Open
        </ButtonLink>
      ) : <small>Available in the published course record</small>}
    </li>
  );
}

function BlockView({ block, lowBandwidth }: { readonly block: StudioBlock; readonly lowBandwidth: boolean }) {
  const children = blockChildren(block);
  const content = text(block.data, "text") ?? text(block.data, "content") ?? "";

  if (block.type === "heading") {
    const level = headingLevel(block.data);
    if (level === 3) return <h3>{content}</h3>;
    if (level === 4) return <h4>{content}</h4>;
    return <h2>{content}</h2>;
  }
  if (block.type === "paragraph") return <p>{content}</p>;
  if (block.type === "quote") return <blockquote>{content}</blockquote>;
  if (block.type === "callout") return <aside className={styles.callout}><strong>{text(block.data, "title") ?? "Note"}</strong><p>{content}</p></aside>;
  if (block.type === "divider") return <hr />;
  if (block.type === "code") return <pre><code>{text(block.data, "code") ?? content}</code></pre>;
  if (block.type === "equation") return <div className={styles.equation}>{text(block.data, "formula") ?? content}</div>;

  if (block.type === "image") {
    const source = safeUrl(text(block.data, "url"));
    if (lowBandwidth || !source) return <p className={styles.mediaNotice}>Image omitted in this view.</p>;
    return (
      <figure>
        <img src={source} alt={text(block.data, "altText") ?? text(block.data, "alt") ?? ""} loading="lazy" />
        {text(block.data, "caption") ? <figcaption>{text(block.data, "caption")}</figcaption> : null}
      </figure>
    );
  }

  if (block.type === "video" || block.type === "audio") {
    const source = safeUrl(text(block.data, "url"));
    const transcript = text(block.data, "transcript");
    if (lowBandwidth || !source) return transcript ? <div className={styles.transcript}><strong>Transcript</strong><p>{transcript}</p></div> : <p className={styles.mediaNotice}>Media omitted in this view.</p>;
    return (
      <div className={styles.mediaBlock}>
        {block.type === "video" ? <video controls preload="metadata" src={source} /> : <audio controls preload="metadata" src={source} />}
        {transcript ? <details><summary>Transcript</summary><p>{transcript}</p></details> : null}
      </div>
    );
  }

  if (block.type === "file") return <div className={styles.fileBlock}><Icon name="file" size="small" /><span>{text(block.data, "label") ?? "Course resource"}</span></div>;

  if (block.type === "embed") {
    const url = safeUrl(text(block.data, "url"));
    return url ? (
      <div className={styles.embedBlock}>
        <div><strong>{text(block.data, "title") ?? "Embedded resource"}</strong><small>Opens the published external resource.</small></div>
        <ButtonLink variant="secondary" size="small" href={url} target={url.startsWith("/") ? undefined : "_blank"} rel={url.startsWith("/") ? undefined : "noreferrer"} trailingIcon={<Icon name="external-link" size="small" />}>Open resource</ButtonLink>
      </div>
    ) : <p className={styles.mediaNotice}>This embedded resource has no valid published address.</p>;
  }

  if (block.type === "table") {
    return children.length > 0
      ? <div className={styles.blockGroup}>{children.map((child) => <BlockView key={child.id} block={child} lowBandwidth={lowBandwidth} />)}</div>
      : <p className={styles.mediaNotice}>Table content is unavailable in this lesson version.</p>;
  }

  if (block.type === "columns" || block.type === "accordion" || block.type === "tabs") {
    return <div className={styles.blockGroup}>{children.map((child) => <BlockView key={child.id} block={child} lowBandwidth={lowBandwidth} />)}</div>;
  }

  if (block.type === "quiz" || block.type === "activity" || block.type === "outcome") {
    return <section className={styles.activity}><strong>{text(block.data, "title") ?? block.type.replaceAll("-", " ")}</strong>{content ? <p>{content}</p> : null}{children.map((child) => <BlockView key={child.id} block={child} lowBandwidth={lowBandwidth} />)}</section>;
  }

  return children.length > 0
    ? <div className={styles.blockGroup}>{children.map((child) => <BlockView key={child.id} block={child} lowBandwidth={lowBandwidth} />)}</div>
    : content ? <p>{content}</p> : null;
}

function allLessons(room: LearnerCourseRoom): readonly LearnerLessonView[] {
  return room.modules.flatMap((module) => module.lessons);
}

function firstLesson(room: LearnerCourseRoom): LearnerLessonView | undefined {
  const lessons = allLessons(room);
  return lessons.find((lesson) => !lesson.completed) ?? lessons[0];
}

function recordLabel(record: Readonly<Record<string, unknown>>, fallback: string): string {
  return text(record, "title") ?? text(record, "name") ?? fallback;
}

function RecordList({ records, empty, kind }: { readonly records: readonly Readonly<Record<string, unknown>>[]; readonly empty: string; readonly kind: "announcement" | "schedule" | "discussion" }) {
  if (records.length === 0) return <EmptyState compact title={empty} description="Nothing is currently published for this course." />;
  return (
    <ul className={styles.recordList}>
      {records.map((record, index) => {
        const dateValue = text(record, "startsAt") ?? text(record, "publishedAt") ?? text(record, "createdAt");
        const date = safeDate(dateValue);
        return (
          <li key={text(record, "id") ?? `${kind}-${index}`}>
            <strong>{recordLabel(record, kind)}</strong>
            {text(record, "body") ? <p>{text(record, "body")}</p> : null}
            {dateValue ? <time {...(date.dateTime ? { dateTime: date.dateTime } : {})}>{date.label}</time> : null}
          </li>
        );
      })}
    </ul>
  );
}

export function LearnerCourseWorkspace({ room, lowBandwidth }: { readonly room: LearnerCourseRoom; readonly lowBandwidth: boolean }) {
  const router = useRouter();
  const initialLesson = firstLesson(room);
  const [lessonId, setLessonId] = useState(initialLesson?.id ?? "");
  const [tab, setTab] = useState("lesson");
  const [pending, setPending] = useState<"complete" | "bookmark" | "offline" | "share" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const lessons = useMemo(() => allLessons(room), [room]);
  const activeLesson = lessons.find((lesson) => lesson.id === lessonId) ?? lessons[0];
  const activeIndex = activeLesson ? lessons.findIndex((lesson) => lesson.id === activeLesson.id) : -1;
  const previousLesson = activeIndex > 0 ? lessons[activeIndex - 1] : undefined;
  const nextLesson = activeIndex >= 0 ? lessons[activeIndex + 1] : undefined;
  const resourceBlocks = activeLesson?.blocks.filter((block) => ["image", "video", "audio", "file", "embed"].includes(block.type)) ?? [];
  const freshness = safeDate(room.dataFreshness);

  const selectLesson = (id: string) => {
    setLessonId(id);
    setTab("lesson");
    setMessage(null);
    setFailure(null);
  };

  const runCommand = async (kind: Exclude<typeof pending, null>, action: () => Promise<unknown>, success: string) => {
    if (pending) return;
    setPending(kind);
    setMessage(null);
    setFailure(null);
    try {
      await action();
      setMessage(success);
      router.refresh();
    } catch (error) {
      setFailure(error instanceof Error ? error.message : "The learner action could not be completed.");
    } finally {
      setPending(null);
    }
  };

  const completeLesson = async () => {
    if (!activeLesson || activeLesson.completed) return;
    await runCommand("complete", () => postLearnerCommand("evidence", {
      enrolmentId: room.enrolmentId,
      lessonId: activeLesson.id,
      evidenceType: "manual-completion",
      evidenceKey: `manual:${room.publicationSnapshotId}:${activeLesson.id}`,
      evidence: {
        publicationSnapshotId: room.publicationSnapshotId,
        publicationChecksum: room.publicationChecksum,
        source: "learner-course-room",
      },
    }), "Lesson marked complete.");
  };

  const saveBookmark = async () => {
    if (!activeLesson) return;
    await runCommand("bookmark", () => postLearnerCommand("bookmark", {
      enrolmentId: room.enrolmentId,
      lessonId: activeLesson.id,
    }), "Lesson bookmark saved.");
  };

  const createOfflineCopy = async () => {
    if (!room.offlineAvailable) return;
    await runCommand("offline", () => postLearnerCommand("offline", {
      enrolmentId: room.enrolmentId,
      mode: lowBandwidth ? "low-bandwidth" : "full",
    }), "Offline course copy prepared.");
  };

  const shareLesson = async () => {
    if (!activeLesson || pending) return;
    setPending("share");
    setMessage(null);
    setFailure(null);
    try {
      const url = window.location.href;
      if (navigator.share) await navigator.share({ title: activeLesson.title, text: room.courseTitle, url });
      else await navigator.clipboard.writeText(url);
      setMessage(navigator.share ? "Share dialog opened." : "Lesson link copied.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      setFailure("The lesson link could not be shared from this browser.");
    } finally {
      setPending(null);
    }
  };

  if (!activeLesson) {
    return <div className={styles.page}><EmptyState title="No published lessons" description="This course has no lesson content available in the active publication snapshot." /></div>;
  }

  const tabs = [
    {
      id: "lesson",
      label: "Lesson",
      content: <article className={styles.lessonContent}>{activeLesson.blocks.length ? activeLesson.blocks.map((block) => <BlockView key={block.id} block={block} lowBandwidth={lowBandwidth} />) : <EmptyState compact title="No lesson blocks" description="This published lesson does not contain learner-visible content blocks." />}</article>,
    },
    {
      id: "resources",
      label: "Resources",
      badge: resourceBlocks.length || undefined,
      content: resourceBlocks.length ? <ul className={styles.resourceList}>{resourceBlocks.map((block) => <ResourceBlock key={block.id} block={block} />)}</ul> : <EmptyState compact title="No lesson resources" description="This lesson has no published media, files or embedded resources." />,
    },
    {
      id: "discussion",
      label: "Discussion",
      badge: room.discussions.length || undefined,
      content: <RecordList records={room.discussions} empty="No open discussions" kind="discussion" />,
    },
  ];

  return (
    <div className={styles.page}>
      <header className={styles.courseHeader}>
        <ButtonLink variant="quiet" size="small" href="/learning" leadingIcon={<Icon name="chevron-left" size="small" />}>Back to my learning</ButtonLink>
        <div className={styles.courseHeadingRow}>
          <div>
            <p className={styles.context}>Course room</p>
            <h1>{room.courseTitle}</h1>
            <p>{room.completedLessons} of {room.totalLessons} lessons completed in the active publication.</p>
          </div>
          <ProgressState className={styles.headerProgress} label="Course progress" value={room.progressPercent} detail={`${room.progressPercent}% complete`} />
        </div>
      </header>

      <div className={styles.courseShell}>
        <nav className={styles.outline} aria-label="Course outline">
          <header><strong>Course outline</strong><span>{room.completedLessons}/{room.totalLessons}</span></header>
          {room.modules.map((module) => (
            <section key={module.id} aria-labelledby={`module-${module.id}`}>
              <div className={styles.moduleHeading}><h2 id={`module-${module.id}`}>{module.title}</h2><span>{module.completionPercent}%</span></div>
              <div className={styles.lessonLinks}>
                {module.lessons.map((lesson) => (
                  <button key={lesson.id} type="button" className={lesson.id === activeLesson.id ? styles.activeLesson : undefined} aria-current={lesson.id === activeLesson.id ? "page" : undefined} onClick={() => selectLesson(lesson.id)}>
                    <span className={styles.lessonState} aria-hidden="true">{lesson.completed ? <Icon name="check-circle" size="small" /> : lesson.sequenceNumber}</span>
                    <span><strong>{lesson.title}</strong>{lesson.estimatedMinutes ? <small>{lesson.estimatedMinutes} min</small> : null}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
        </nav>

        <main className={styles.lessonPane}>
          <header className={styles.lessonHeader}>
            <div>
              <p className={styles.context}>Lesson {activeIndex + 1} of {lessons.length}</p>
              <h2>{activeLesson.title}</h2>
              {activeLesson.summary ? <p>{activeLesson.summary}</p> : null}
            </div>
            <div className={styles.lessonActions}>
              <Button variant="quiet" size="small" loading={pending === "bookmark"} onClick={saveBookmark} leadingIcon={<Icon name="bookmark" size="small" />}>{activeLesson.bookmarked ? "Bookmark saved" : "Bookmark"}</Button>
              <Button variant="quiet" size="small" loading={pending === "share"} onClick={shareLesson} leadingIcon={<Icon name="share" size="small" />}>Share</Button>
            </div>
          </header>

          {failure ? <div className={styles.actionError} role="alert">{failure}</div> : null}
          {message ? <div className={styles.actionStatus} role="status" aria-live="polite">{message}</div> : null}

          <Tabs className={styles.lessonTabs} label="Lesson sections" tabs={tabs} value={tab} onValueChange={setTab} />

          <footer className={styles.lessonFooter}>
            <Button variant="secondary" disabled={!previousLesson || Boolean(pending)} onClick={() => previousLesson && selectLesson(previousLesson.id)} leadingIcon={<Icon name="chevron-left" size="small" />}>Previous</Button>
            <Button loading={pending === "complete"} disabled={activeLesson.completed || Boolean(pending && pending !== "complete")} onClick={completeLesson} leadingIcon={<Icon name="check" size="small" />}>{activeLesson.completed ? "Completed" : "Mark complete"}</Button>
            <Button variant="secondary" disabled={!nextLesson || Boolean(pending)} onClick={() => nextLesson && selectLesson(nextLesson.id)} trailingIcon={<Icon name="chevron-right" size="small" />}>Next</Button>
          </footer>
        </main>

        <aside className={styles.contextRail} aria-label="Course context">
          <section>
            <h2>Progress</h2>
            <ProgressState label="Course progress" value={room.progressPercent} detail={`${room.completedLessons} of ${room.totalLessons} lessons`} />
          </section>

          <section>
            <h2>Next lessons</h2>
            {lessons.slice(activeIndex + 1, activeIndex + 4).length ? (
              <ol className={styles.nextList}>{lessons.slice(activeIndex + 1, activeIndex + 4).map((lesson) => <li key={lesson.id}><button type="button" onClick={() => selectLesson(lesson.id)}><strong>{lesson.title}</strong>{lesson.estimatedMinutes ? <small>{lesson.estimatedMinutes} min</small> : null}</button></li>)}</ol>
            ) : <p className={styles.muted}>No later lesson is published.</p>}
          </section>

          <section>
            <h2>Schedule</h2>
            <RecordList records={room.timetable.slice(0, 3)} empty="No upcoming sessions" kind="schedule" />
          </section>

          <section>
            <h2>Course controls</h2>
            <Checkbox
              checked={lowBandwidth}
              label="Low-bandwidth mode"
              description="Reload this course using the reduced-bandwidth server projection."
              onCheckedChange={(checked) => router.replace(`/courses/${room.enrolmentId}${checked ? "?lowBandwidth=true" : ""}`)}
            />
            <Button className={styles.offlineAction} variant="secondary" size="small" disabled={!room.offlineAvailable} loading={pending === "offline"} onClick={createOfflineCopy} leadingIcon={<Icon name="download" size="small" />}>
              Prepare offline copy
            </Button>
            <small className={styles.freshness}>Data refreshed <time {...(freshness.dateTime ? { dateTime: freshness.dateTime } : {})}>{freshness.label}</time></small>
          </section>

          {room.announcements.length ? <section><h2>Announcements</h2><RecordList records={room.announcements.slice(0, 3)} empty="No announcements" kind="announcement" /></section> : null}
        </aside>
      </div>
    </div>
  );
}
