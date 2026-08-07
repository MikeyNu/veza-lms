"use client";

import type { Route } from "next";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icon";

interface SearchItem {
  readonly id: string;
  readonly entityType: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly excerpt?: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

interface SearchResponse {
  readonly items: readonly SearchItem[];
  readonly latencyMs: number;
}

const searchFilters = [
  ["", "All"],
  ["person", "People"],
  ["programme-version,course-blueprint,course-run", "Catalogue"],
  ["studio-lesson", "Lessons"],
  ["media-asset", "Assets"],
] as const;

function icon(type: string): string {
  if (type === "person") return "PE";
  if (type === "programme-version") return "PR";
  if (type === "course-blueprint" || type === "course-run") return "CR";
  if (type === "studio-lesson") return "LS";
  if (type === "media-asset") return "AS";
  return "SR";
}

function href(item: SearchItem): Route {
  const candidate = item.metadata.href;
  if (typeof candidate !== "string" || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return "/";
  }
  return candidate as Route;
}

function excerpt(item: SearchItem): string {
  return (item.excerpt ?? "").replace(/<\/?mark>/g, "").slice(0, 180);
}

export function CommandSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [type, setType] = useState("");
  const [items, setItems] = useState<readonly SearchItem[]>([]);
  const [status, setStatus] = useState("Search people, programmes, courses and learning content.");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, []);

  useEffect(() => {
    if (open) window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("Searching current permissions...");
      const params = new URLSearchParams({ query, limit: "12" });
      if (type) params.set("types", type);
      try {
        const response = await fetch(`/api/search?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const body = (await response.json()) as SearchResponse & { message?: string };
        if (!response.ok) throw new Error(body.message ?? "Search failed");
        setItems(body.items);
        setStatus(
          body.items.length > 0
            ? `${body.items.length} permitted results, ${body.latencyMs} ms`
            : "No permitted results match this search.",
        );
      } catch (error) {
        if (controller.signal.aborted) return;
        setItems([]);
        setStatus(error instanceof Error ? error.message : "Search failed");
      }
    }, query ? 180 : 0);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [open, query, type]);

  return (
    <>
      <button className="vz-search-button" type="button" onClick={() => setOpen(true)}>
        <Icon name="search" />
        <span>Search Veza</span>
        <kbd>Ctrl K</kbd>
      </button>
      {open ? (
        <div className="vz-command-backdrop" role="presentation" onMouseDown={() => setOpen(false)}>
          <section
            className="vz-command-palette"
            role="dialog"
            aria-modal="true"
            aria-label="Search Veza"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <Icon name="search" />
              <input
                ref={inputRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search people, programmes, courses, lessons or assets"
                maxLength={500}
              />
              <button type="button" onClick={() => setOpen(false)}>Esc</button>
            </header>
            <nav aria-label="Search filters">
              {searchFilters.map(([value, label]) => (
                <button
                  type="button"
                  className={type === value ? "active" : ""}
                  onClick={() => setType(value)}
                  key={value}
                >
                  {label}
                </button>
              ))}
            </nav>
            <div className="vz-command-results">
              {items.map((item) => (
                <Link href={href(item)} key={item.id} onClick={() => setOpen(false)}>
                  <span className="vz-command-icon">{icon(item.entityType)}</span>
                  <div>
                    <strong>{item.title}</strong>
                    <small>{item.subtitle ?? item.entityType.replaceAll("-", " ")}</small>
                    {excerpt(item) ? <p>{excerpt(item)}</p> : null}
                  </div>
                  <Icon name="arrow" />
                </Link>
              ))}
            </div>
            <footer><span>{status}</span><span>Results respect tenant, institution and role scope.</span></footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
