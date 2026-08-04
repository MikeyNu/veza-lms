import type { ReactNode } from "react";

export type IconName =
  | "home"
  | "book"
  | "grid"
  | "check"
  | "calendar"
  | "chart"
  | "search"
  | "bell"
  | "arrow"
  | "play"
  | "people"
  | "studio"
  | "message"
  | "admin"
  | "help"
  | "classroom"
  | "evidence"
  | "support";

const paths: Record<IconName, ReactNode> = {
  home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9 21v-7h6v7"/></>,
  book: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H20v17H7.5A3.5 3.5 0 0 0 4 22Z"/><path d="M4 5.5v13A3.5 3.5 0 0 1 7.5 15H20"/></>,
  grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  check: <><rect x="3" y="4" width="18" height="17" rx="3"/><path d="M8 2v4M16 2v4M7 11l3 3 7-7"/></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></>,
  chart: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>,
  arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
  play: <path d="m9 7 8 5-8 5Z"/>,
  people: <><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3 20a6 6 0 0 1 12 0M14 15a5 5 0 0 1 7 4.5"/></>,
  studio: <><path d="m4 20 5-1 10-10-4-4L5 15l-1 5Z"/><path d="m13 7 4 4M4 4h5M4 8h3"/></>,
  message: <><path d="M4 4h16v12H8l-4 4V4Z"/><path d="M8 9h8M8 12h5"/></>,
  admin: <><path d="M12 3 4 7v5c0 5 3.4 8.3 8 9 4.6-.7 8-4 8-9V7l-8-4Z"/><path d="M9 12l2 2 4-5"/></>,
  help: <><circle cx="12" cy="12" r="9"/><path d="M9.8 9a2.4 2.4 0 1 1 3.7 2c-1 .6-1.5 1.1-1.5 2M12 17h.01"/></>,
  classroom: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4M7 9h4M7 12h7"/></>,
  evidence: <><path d="M7 3h10l3 3v15H4V3h3Z"/><path d="M14 3v5h6M8 12h8M8 16h6"/></>,
  support: <><path d="M4 13a8 8 0 0 1 16 0"/><path d="M4 13v4a2 2 0 0 0 2 2h2v-7H4ZM20 13v4a2 2 0 0 1-2 2h-2v-7h4ZM16 20c-1 1-2.3 1.5-4 1.5"/></>,
};

export function Icon({ name }: { name: IconName }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
