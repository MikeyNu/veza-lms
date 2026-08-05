import type { HTMLAttributes, ReactNode } from "react";
import { ButtonLink, Link } from "./primitives.js";
import { cx, type VezaTone } from "./utilities.js";

export interface EmptyStateProps extends HTMLAttributes<HTMLElement> {
  readonly title: string;
  readonly description: ReactNode;
  readonly primaryAction?: { readonly label: string; readonly href: string };
  readonly secondaryAction?: { readonly label: string; readonly href: string };
  readonly compact?: boolean;
}

export function EmptyState({
  title,
  description,
  primaryAction,
  secondaryAction,
  compact = false,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <section {...props} className={cx("vz-empty-state", compact && "vz-empty-state--compact", className)}>
      <div className="vz-empty-state__rule" aria-hidden="true" />
      <h2>{title}</h2>
      <div className="vz-empty-state__description">{description}</div>
      {primaryAction || secondaryAction ? (
        <div className="vz-empty-state__actions">
          {primaryAction ? <ButtonLink href={primaryAction.href}>{primaryAction.label}</ButtonLink> : null}
          {secondaryAction ? <Link href={secondaryAction.href} variant="standalone">{secondaryAction.label}</Link> : null}
        </div>
      ) : null}
    </section>
  );
}

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  readonly label?: string;
  readonly detail?: string;
  readonly inline?: boolean;
}

export function LoadingState({ label = "Loading", detail, inline = false, className, ...props }: LoadingStateProps) {
  return (
    <div {...props} className={cx("vz-loading-state", inline && "vz-loading-state--inline", className)} role="status" aria-live="polite">
      <span className="vz-loading-state__spinner" aria-hidden="true" />
      <span><strong>{label}</strong>{detail ? <small>{detail}</small> : null}</span>
    </div>
  );
}

export interface ErrorStateProps extends HTMLAttributes<HTMLElement> {
  readonly title?: string;
  readonly message: ReactNode;
  readonly reference?: string;
  readonly action?: ReactNode;
}

export function ErrorState({ title = "This view could not be loaded", message, reference, action, className, ...props }: ErrorStateProps) {
  return (
    <section {...props} className={cx("vz-error-state", className)} role="alert">
      <div aria-hidden="true">!</div>
      <div><h2>{title}</h2><p>{message}</p>{reference ? <code>{reference}</code> : null}</div>
      {action ? <div className="vz-error-state__action">{action}</div> : null}
    </section>
  );
}

export interface SkeletonProps extends HTMLAttributes<HTMLSpanElement> {
  readonly width?: string;
  readonly height?: string;
  readonly shape?: "text" | "circle" | "block";
}

export function Skeleton({ width, height, shape = "text", className, style, ...props }: SkeletonProps) {
  return (
    <span
      {...props}
      aria-hidden="true"
      className={cx("vz-skeleton", `vz-skeleton--${shape}`, className)}
      style={{ ...style, ...(width ? { width } : {}), ...(height ? { height } : {}) }}
    />
  );
}

export interface StatusIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  readonly tone?: VezaTone;
  readonly label: string;
  readonly detail?: string;
  readonly quiet?: boolean;
}

export function StatusIndicator({ tone = "neutral", label, detail, quiet = false, className, ...props }: StatusIndicatorProps) {
  return (
    <span {...props} className={cx("vz-status", `vz-status--${tone}`, quiet && "vz-status--quiet", className)}>
      <span className="vz-status__dot" aria-hidden="true" />
      <span>{label}</span>
      {detail ? <small>{detail}</small> : null}
    </span>
  );
}

export interface TimelineItem {
  readonly id: string;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly timestamp?: ReactNode;
  readonly actor?: ReactNode;
  readonly tone?: VezaTone;
  readonly metadata?: ReactNode;
}

export function Timeline({ items, label = "Timeline", className }: { readonly items: readonly TimelineItem[]; readonly label?: string; readonly className?: string }) {
  return (
    <ol className={cx("vz-timeline", className)} aria-label={label}>
      {items.map((item) => (
        <li key={item.id} className={cx("vz-timeline__item", `vz-timeline__item--${item.tone ?? "neutral"}`)}>
          <span className="vz-timeline__marker" aria-hidden="true" />
          <div className="vz-timeline__content">
            <header><strong>{item.title}</strong>{item.timestamp ? <time>{item.timestamp}</time> : null}</header>
            {item.description ? <div className="vz-timeline__description">{item.description}</div> : null}
            {item.actor || item.metadata ? <footer>{item.actor ? <span>{item.actor}</span> : null}{item.metadata}</footer> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

export interface AuditEntry {
  readonly id: string;
  readonly action: string;
  readonly actor: string;
  readonly occurredAt: string;
  readonly reason?: string;
  readonly correlationId?: string;
  readonly before?: ReactNode;
  readonly after?: ReactNode;
}

export function AuditHistory({ entries, label = "Audit history" }: { readonly entries: readonly AuditEntry[]; readonly label?: string }) {
  return (
    <section className="vz-audit-history" aria-label={label}>
      {entries.length === 0 ? <EmptyState compact title="No audit events" description="Changes to this record will appear here with actor, reason and correlation evidence." /> : null}
      {entries.map((entry) => (
        <article key={entry.id} className="vz-audit-entry">
          <header>
            <div><strong>{entry.action}</strong><span>{entry.actor}</span></div>
            <time dateTime={entry.occurredAt}>{new Date(entry.occurredAt).toLocaleString()}</time>
          </header>
          {entry.reason ? <p>{entry.reason}</p> : null}
          {entry.before || entry.after ? (
            <dl className="vz-audit-entry__diff">
              {entry.before ? <div><dt>Before</dt><dd>{entry.before}</dd></div> : null}
              {entry.after ? <div><dt>After</dt><dd>{entry.after}</dd></div> : null}
            </dl>
          ) : null}
          {entry.correlationId ? <footer><span>Correlation</span><code>{entry.correlationId}</code></footer> : null}
        </article>
      ))}
    </section>
  );
}
