import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./utilities.js";

type SectionElementAttributes = Omit<HTMLAttributes<HTMLElement>, "title">;

export interface PageHeaderProps extends SectionElementAttributes {
  readonly eyebrow?: ReactNode;
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly metadata?: ReactNode;
}

export function PageHeader({ eyebrow, title, description, actions, metadata, className, ...props }: PageHeaderProps) {
  return (
    <header {...props} className={cx("vz-page-header", className)}>
      <div className="vz-page-header__copy">
        {eyebrow ? <p className="vz-eyebrow">{eyebrow}</p> : null}
        <h1>{title}</h1>
        {description ? <div className="vz-page-header__description">{description}</div> : null}
        {metadata ? <div className="vz-page-header__metadata">{metadata}</div> : null}
      </div>
      {actions ? <div className="vz-page-header__actions">{actions}</div> : null}
    </header>
  );
}

export interface SectionProps extends SectionElementAttributes {
  readonly title?: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly divided?: boolean;
}

export function Section({ title, description, actions, children, divided = true, className, ...props }: SectionProps) {
  return (
    <section {...props} className={cx("vz-section", divided && "vz-section--divided", className)}>
      {title || description || actions ? (
        <header className="vz-section__header">
          <div>{title ? <h2>{title}</h2> : null}{description ? <p>{description}</p> : null}</div>
          {actions ? <div className="vz-section__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="vz-section__content">{children}</div>
    </section>
  );
}

export function Toolbar({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("vz-toolbar", className)} role={props.role ?? "toolbar"} />;
}

export interface ContextRailItem {
  readonly id: string;
  readonly label: ReactNode;
  readonly href?: string;
  readonly active?: boolean;
  readonly disabled?: boolean;
  readonly meta?: ReactNode;
  readonly onSelect?: () => void;
}

export interface ContextRailProps extends SectionElementAttributes {
  readonly label: string;
  readonly title?: ReactNode;
  readonly items: readonly ContextRailItem[];
  readonly footer?: ReactNode;
}

export function ContextRail({ label, title, items, footer, className, ...props }: ContextRailProps) {
  return (
    <aside {...props} className={cx("vz-context-rail", className)} aria-label={label}>
      {title ? <header>{title}</header> : null}
      <nav aria-label={label}>
        {items.map((item) => {
          const content = <><span>{item.label}</span>{item.meta ? <small>{item.meta}</small> : null}</>;
          if (item.href && !item.disabled) {
            return <a key={item.id} href={item.href} aria-current={item.active ? "page" : undefined} className={cx(item.active && "is-active")}>{content}</a>;
          }
          return (
            <button key={item.id} type="button" disabled={item.disabled} aria-current={item.active ? "page" : undefined} className={cx(item.active && "is-active")} onClick={item.onSelect}>
              {content}
            </button>
          );
        })}
      </nav>
      {footer ? <footer>{footer}</footer> : null}
    </aside>
  );
}

export interface InspectorPanelProps extends SectionElementAttributes {
  readonly title: ReactNode;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly footer?: ReactNode;
}

export function InspectorPanel({ title, description, actions, footer, className, children, ...props }: InspectorPanelProps) {
  return (
    <aside {...props} className={cx("vz-inspector", className)} aria-label={typeof title === "string" ? title : "Inspector"}>
      <header><div><h2>{title}</h2>{description ? <p>{description}</p> : null}</div>{actions}</header>
      <div className="vz-inspector__body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </aside>
  );
}

export function SplitWorkspace({
  rail,
  children,
  inspector,
  className,
}: {
  readonly rail?: ReactNode;
  readonly children: ReactNode;
  readonly inspector?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={cx("vz-split-workspace", Boolean(rail) && "has-rail", Boolean(inspector) && "has-inspector", className)}>
      {rail}
      <main className="vz-split-workspace__main">{children}</main>
      {inspector}
    </div>
  );
}

export interface MetricStripItem {
  readonly label: string;
  readonly value: ReactNode;
  readonly detail?: ReactNode;
  readonly tone?: "neutral" | "success" | "warning" | "critical";
}

export function MetricStrip({ items, label = "Summary metrics" }: { readonly items: readonly MetricStripItem[]; readonly label?: string }) {
  return (
    <dl className="vz-metric-strip" aria-label={label}>
      {items.map((item) => (
        <div key={item.label} data-tone={item.tone ?? "neutral"}>
          <dt>{item.label}</dt><dd>{item.value}</dd>{item.detail ? <small>{item.detail}</small> : null}
        </div>
      ))}
    </dl>
  );
}

export function ResponsiveStack({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cx("vz-responsive-stack", className)} />;
}
