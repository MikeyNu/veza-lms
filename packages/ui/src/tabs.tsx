"use client";

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { cx } from "./utilities.js";

export interface TabDefinition {
  readonly id: string;
  readonly label: ReactNode;
  readonly content: ReactNode;
  readonly disabled?: boolean;
  readonly badge?: ReactNode;
}

export interface TabsProps {
  readonly tabs: readonly TabDefinition[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string) => void;
  readonly orientation?: "horizontal" | "vertical";
  readonly className?: string;
  readonly label: string;
}

export function Tabs({
  tabs,
  value,
  defaultValue,
  onValueChange,
  orientation = "horizontal",
  className,
  label,
}: TabsProps) {
  const generatedId = useId().replaceAll(":", "");
  const firstEnabled = tabs.find((tab) => !tab.disabled)?.id ?? "";
  const [internal, setInternal] = useState(defaultValue ?? firstEnabled);
  const current = value ?? internal;
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const select = (id: string) => {
    if (value === undefined) setInternal(id);
    onValueChange?.(id);
  };
  const move = (event: KeyboardEvent<HTMLDivElement>, direction: 1 | -1) => {
    const enabled = tabs.filter((tab) => !tab.disabled);
    const index = enabled.findIndex((tab) => tab.id === current);
    if (index < 0) return;
    const next = enabled[(index + direction + enabled.length) % enabled.length];
    if (!next) return;
    event.preventDefault();
    select(next.id);
    refs.current.get(next.id)?.focus();
  };
  const active = tabs.find((tab) => tab.id === current) ?? tabs.find((tab) => !tab.disabled);
  return (
    <div className={cx("vz-tabs", `vz-tabs--${orientation}`, className)}>
      <div
        role="tablist"
        aria-label={label}
        aria-orientation={orientation}
        className="vz-tabs__list"
        onKeyDown={(event) => {
          const previousKey = orientation === "horizontal" ? "ArrowLeft" : "ArrowUp";
          const nextKey = orientation === "horizontal" ? "ArrowRight" : "ArrowDown";
          if (event.key === previousKey) move(event, -1);
          else if (event.key === nextKey) move(event, 1);
          else if (event.key === "Home") {
            const first = tabs.find((tab) => !tab.disabled);
            if (first) {
              event.preventDefault();
              select(first.id);
              refs.current.get(first.id)?.focus();
            }
          } else if (event.key === "End") {
            const last = [...tabs].reverse().find((tab) => !tab.disabled);
            if (last) {
              event.preventDefault();
              select(last.id);
              refs.current.get(last.id)?.focus();
            }
          }
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active?.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) refs.current.set(tab.id, node);
                else refs.current.delete(tab.id);
              }}
              id={`${generatedId}-${tab.id}-tab`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${generatedId}-${tab.id}-panel`}
              tabIndex={selected ? 0 : -1}
              disabled={tab.disabled}
              onClick={() => select(tab.id)}
            >
              <span>{tab.label}</span>{tab.badge ? <span className="vz-tabs__badge">{tab.badge}</span> : null}
            </button>
          );
        })}
      </div>
      {active ? (
        <div
          id={`${generatedId}-${active.id}-panel`}
          role="tabpanel"
          aria-labelledby={`${generatedId}-${active.id}-tab`}
          tabIndex={0}
          className="vz-tabs__panel"
        >
          {active.content}
        </div>
      ) : null}
    </div>
  );
}

export interface TabPanelsProps {
  readonly children: ReactNode;
  readonly activeId: string;
}

export function TabPanels({ children, activeId }: TabPanelsProps) {
  return <>{Children.map(children, (child) => {
    if (!isValidElement<{ id: string }>(child)) return null;
    return cloneElement(child as ReactElement<{ id: string; hidden?: boolean }>, { hidden: child.props.id !== activeId });
  })}</>;
}
