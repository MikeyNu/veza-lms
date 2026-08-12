"use client";

import {
  useId,
  useRef,
  type FormEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Icon } from "./icons.js";
import { Button, IconButton } from "./primitives.js";
import { cx } from "./utilities.js";

export type StructuredBlockType =
  | "heading"
  | "paragraph"
  | "quote"
  | "list"
  | "image"
  | "video"
  | "audio"
  | "file"
  | "activity"
  | "outcome"
  | "callout"
  | "divider"
  | "code"
  | "equation";

export interface StructuredContentProps extends HTMLAttributes<HTMLDivElement> {
  readonly label: string;
  readonly readOnly?: boolean;
}

export function StructuredContent({ label, readOnly = false, className, ...props }: StructuredContentProps) {
  return <div {...props} className={cx("vz-structured-content", readOnly && "is-read-only", className)} aria-label={label} />;
}

export interface ContentBlockProps extends HTMLAttributes<HTMLElement> {
  readonly blockId: string;
  readonly type: StructuredBlockType;
  readonly label?: string;
  readonly selected?: boolean;
  readonly invalid?: boolean;
  readonly draggable?: boolean;
  readonly controls?: ReactNode;
  readonly onSelect?: () => void;
}

export function ContentBlock({
  blockId,
  type,
  label,
  selected = false,
  invalid = false,
  draggable = false,
  controls,
  onSelect,
  className,
  children,
  ...props
}: ContentBlockProps) {
  return (
    <article
      {...props}
      data-block-id={blockId}
      data-block-type={type}
      data-selected={selected || undefined}
      data-invalid={invalid || undefined}
      className={cx("vz-content-block", className)}
      tabIndex={onSelect ? 0 : undefined}
      aria-label={label ?? `${type} block`}
      onClick={onSelect}
      onKeyDown={(event) => {
        props.onKeyDown?.(event);
        if (!event.defaultPrevented && onSelect && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onSelect();
        }
      }}
    >
      {draggable ? <BlockHandle label={`Move ${label ?? type} block`} /> : null}
      <div className="vz-content-block__body">{children}</div>
      {controls ? <div className="vz-content-block__controls">{controls}</div> : null}
    </article>
  );
}

export function BlockHandle({ label, onMoveUp, onMoveDown }: { readonly label: string; readonly onMoveUp?: () => void; readonly onMoveDown?: () => void }) {
  return (
    <div className="vz-block-handle" role="toolbar" aria-label={label}>
      <Icon name="grip" size="small" aria-hidden="true" />
      {onMoveUp ? <IconButton size="small" label="Move block up" icon={<Icon name="arrow-up" size="small" />} onClick={onMoveUp} /> : null}
      {onMoveDown ? <IconButton size="small" label="Move block down" icon={<Icon name="arrow-down" size="small" />} onClick={onMoveDown} /> : null}
    </div>
  );
}

export interface RichTextAction {
  readonly id: string;
  readonly label: string;
  readonly icon: ReactNode;
  readonly pressed?: boolean;
  readonly disabled?: boolean;
  readonly onAction: () => void;
}

export function RichTextToolbar({ label = "Text formatting", actions }: { readonly label?: string; readonly actions: readonly RichTextAction[] }) {
  return (
    <div className="vz-rich-text-toolbar" role="toolbar" aria-label={label}>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          aria-label={action.label}
          aria-pressed={action.pressed}
          disabled={action.disabled}
          onClick={action.onAction}
        >
          {action.icon}
        </button>
      ))}
    </div>
  );
}

export interface EditableRegionProps extends Omit<HTMLAttributes<HTMLDivElement>, "onInput"> {
  readonly label: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly multiline?: boolean;
  readonly onValueChange?: (value: string) => void;
  readonly onCommit?: (value: string) => void;
}

export function EditableRegion({
  label,
  value,
  placeholder,
  multiline = true,
  onValueChange,
  onCommit,
  className,
  ...props
}: EditableRegionProps) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  const input = (event: FormEvent<HTMLDivElement>) => onValueChange?.(event.currentTarget.textContent ?? "");
  const keyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    props.onKeyDown?.(event);
    if (!multiline && event.key === "Enter") {
      event.preventDefault();
      onCommit?.(event.currentTarget.textContent ?? "");
      event.currentTarget.blur();
    }
  };
  return (
    <div className={cx("vz-editable-region-wrap", className)}>
      <span id={id} className="vz-visually-hidden">{label}</span>
      <div
        {...props}
        ref={ref}
        role="textbox"
        aria-labelledby={id}
        aria-multiline={multiline}
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        className="vz-editable-region"
        onInput={input}
        onKeyDown={keyDown}
        onBlur={(event) => {
          props.onBlur?.(event);
          onCommit?.(event.currentTarget.textContent ?? "");
        }}
      >
        {value}
      </div>
    </div>
  );
}

export interface BlockPaletteItem {
  readonly type: StructuredBlockType;
  readonly label: string;
  readonly description: string;
  readonly icon?: ReactNode;
}

export function BlockPalette({ items, onInsert, label = "Content blocks" }: { readonly items: readonly BlockPaletteItem[]; readonly onInsert: (type: StructuredBlockType) => void; readonly label?: string }) {
  return (
    <section className="vz-block-palette" aria-label={label}>
      {items.map((item) => (
        <button key={item.type} type="button" onClick={() => onInsert(item.type)}>
          <span aria-hidden="true">{item.icon}</span>
          <span><strong>{item.label}</strong><small>{item.description}</small></span>
        </button>
      ))}
    </section>
  );
}

export interface StructuredEditorStatusProps {
  readonly state: "saved" | "saving" | "offline" | "conflict" | "error";
  readonly detail?: string;
  readonly onResolveConflict?: () => void;
}

export function StructuredEditorStatus({ state, detail, onResolveConflict }: StructuredEditorStatusProps) {
  const labels = {
    saved: "All changes saved",
    saving: "Saving changes",
    offline: "Offline. Changes remain on this device",
    conflict: "A newer revision exists",
    error: "Changes could not be saved",
  } as const;
  return (
    <div className={cx("vz-editor-status", `vz-editor-status--${state}`)} role={state === "error" || state === "conflict" ? "alert" : "status"}>
      <span aria-hidden="true" />
      <span><strong>{labels[state]}</strong>{detail ? <small>{detail}</small> : null}</span>
      {state === "conflict" && onResolveConflict ? <Button size="small" variant="secondary" onClick={onResolveConflict}>Review changes</Button> : null}
    </div>
  );
}
