"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Icon } from "./icons.js";
import { Dialog } from "./overlays.js";
import { Kbd } from "./primitives.js";
import { cx } from "./utilities.js";

export interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly group?: string;
  readonly keywords?: readonly string[];
  readonly shortcut?: readonly string[];
  readonly disabled?: boolean;
  readonly icon?: ReactNode;
  readonly onSelect: () => void;
}

export interface CommandPaletteProps {
  readonly commands: readonly CommandItem[];
  readonly open?: boolean;
  readonly defaultOpen?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
  readonly title?: string;
  readonly placeholder?: string;
  readonly noResultsText?: string;
  readonly enableGlobalShortcut?: boolean;
}

export function CommandPalette({
  commands,
  open,
  defaultOpen = false,
  onOpenChange,
  title = "Search Veza",
  placeholder = "Search people, courses, actions and settings",
  noResultsText = "No command matches this search.",
  enableGlobalShortcut = true,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const currentOpen = open ?? internalOpen;
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const setOpen = (next: boolean) => {
    if (open === undefined) setInternalOpen(next);
    onOpenChange?.(next);
    if (!next) setQuery("");
  };

  useEffect(() => {
    if (!enableGlobalShortcut) return;
    const listener = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === "k") {
        event.preventDefault();
        setOpen(!currentOpen);
      }
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, [currentOpen, enableGlobalShortcut]);

  useEffect(() => {
    if (currentOpen) queueMicrotask(() => inputRef.current?.focus());
  }, [currentOpen]);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return commands;
    return commands.filter((command) => [command.label, command.description, command.group, ...(command.keywords ?? [])]
      .filter((part): part is string => Boolean(part))
      .join(" ")
      .toLocaleLowerCase()
      .includes(normalized));
  }, [commands, query]);

  useEffect(() => {
    setActiveIndex(filtered.findIndex((command) => !command.disabled));
  }, [filtered]);

  const run = (command: CommandItem | undefined) => {
    if (!command || command.disabled) return;
    setOpen(false);
    command.onSelect();
  };

  return (
    <Dialog open={currentOpen} onClose={() => setOpen(false)} title={title} size="large">
      <div className="vz-command-palette">
        <div className="vz-command-palette__search">
          <Icon name="search" size="small" aria-hidden="true" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            aria-autocomplete="list"
            value={query}
            placeholder={placeholder}
            onChange={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                for (let offset = 1; offset <= filtered.length; offset += 1) {
                  const index = (activeIndex + offset + filtered.length) % filtered.length;
                  if (!filtered[index]?.disabled) {
                    setActiveIndex(index);
                    break;
                  }
                }
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                for (let offset = 1; offset <= filtered.length; offset += 1) {
                  const index = (activeIndex - offset + filtered.length) % filtered.length;
                  if (!filtered[index]?.disabled) {
                    setActiveIndex(index);
                    break;
                  }
                }
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(filtered[activeIndex]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setOpen(false);
              }
            }}
          />
          <Kbd>Esc</Kbd>
        </div>
        <div id={listId} role="listbox" aria-label="Commands" className="vz-command-palette__results">
          {filtered.length === 0 ? <p className="vz-command-palette__empty">{noResultsText}</p> : null}
          {filtered.map((command, index) => (
            <button
              key={command.id}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              disabled={command.disabled}
              className={cx(index === activeIndex && "is-active")}
              onMouseEnter={() => !command.disabled && setActiveIndex(index)}
              onClick={() => run(command)}
            >
              <span className="vz-command-palette__icon" aria-hidden="true">{command.icon}</span>
              <span><strong>{command.label}</strong>{command.description ? <small>{command.description}</small> : null}</span>
              {command.shortcut ? <span className="vz-command-palette__shortcut">{command.shortcut.map((key) => <Kbd key={key}>{key}</Kbd>)}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </Dialog>
  );
}

export function CommandPaletteTrigger({ onClick, label = "Search Veza" }: { readonly onClick: () => void; readonly label?: string }) {
  return (
    <button type="button" className="vz-command-trigger" onClick={onClick} aria-haspopup="dialog">
      <Icon name="search" size="small" aria-hidden="true" /><span>{label}</span><span><Kbd>Ctrl</Kbd><Kbd>K</Kbd></span>
    </button>
  );
}
