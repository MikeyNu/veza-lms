"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

type Notice = Readonly<{
  id: string;
  title: string;
  detail: string;
  time: string;
  unread?: boolean;
}>;

const demoNotices: readonly Notice[] = [
  {
    id: "assignment-due",
    title: "Lab 2 is due Monday",
    detail: "Data Literacy Foundations · 17:00",
    time: "12 min ago",
    unread: true,
  },
  {
    id: "support-session",
    title: "Lab support session added",
    detail: "Friday · 14:00 · Live session",
    time: "1 hr ago",
    unread: true,
  },
  {
    id: "result-published",
    title: "Source evaluation result published",
    detail: "18 / 20 · Feedback is ready",
    time: "Yesterday",
  },
];

export function NotificationPopover({ demo = false }: { demo?: boolean }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const notices = demo ? demoNotices : [];
  const unread = notices.filter((notice) => notice.unread).length;

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="notification-control" ref={rootRef}>
      <button
        className="topbar-tool notification-trigger"
        type="button"
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="bell" />
        {unread ? <span className="notification-count" aria-hidden="true">{unread}</span> : null}
      </button>

      {open ? (
        <section className="notification-popover" role="dialog" aria-label="Notifications">
          <header>
            <div>
              <strong>Notifications</strong>
              <span>{unread ? `${unread} unread` : "You are up to date"}</span>
            </div>
            {unread ? <button type="button" onClick={() => setOpen(false)}>Mark all read</button> : null}
          </header>

          <div className="notification-list">
            {notices.length ? notices.map((notice) => (
              <article className={notice.unread ? "unread" : ""} key={notice.id}>
                <span className="notification-dot" aria-hidden="true" />
                <div>
                  <strong>{notice.title}</strong>
                  <p>{notice.detail}</p>
                  <small>{notice.time}</small>
                </div>
              </article>
            )) : (
              <div className="notification-empty">
                <span aria-hidden="true"><Icon name="bell" /></span>
                <strong>No new notifications</strong>
                <p>Updates about learning, assessments and institution activity will appear here.</p>
              </div>
            )}
          </div>

          <footer>
            <Link href="/communicate" onClick={() => setOpen(false)}>View notification centre <span aria-hidden="true">→</span></Link>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
