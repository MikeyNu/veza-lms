"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { containsRef, cx } from "./utilities.js";

export interface ComboboxOption {
  readonly value: string;
  readonly label: string;
  readonly description?: string;
  readonly group?: string;
  readonly disabled?: boolean;
  readonly keywords?: readonly string[];
}

export interface ComboboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "defaultValue" | "onChange"> {
  readonly label: string;
  readonly options: readonly ComboboxOption[];
  readonly value?: string;
  readonly defaultValue?: string;
  readonly onValueChange?: (value: string, option: ComboboxOption | undefined) => void
  readonly noResultsText?: string;
  readonly clearLabel?: string;
  readonly renderOption?: (option: ComboboxOption, selected: boolean) => ReactNode;
}

export function Combobox({
  label,
  options,
  value,
  defaultValue = "",
  onValueChange,
  noResultsText = "No matching options",
  clearLabel = "Clear selection",
  renderOption,
  className,
  placeholder,
  disabled,
  required,
  id,
  ...inputProps
}: ComboboxProps) {
  const generatedId = useId().replaceAll(":", "");
  const inputId = id ?? `vz-combobox-${generatedId}`;
  const listboxId = `${inputId}-listbox`;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = isControlled ? value : internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue);
  const [query, setQuery] = useState(selectedOption?.label ?? "");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    setQuery(selectedOption?.label ?? "");
  }, [selectedOption?.label]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!containsRef(rootRef, event.target)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized || normalized === selectedOption?.label.toLocaleLowerCase()) return options;
    return options.filter((option) => {
      const haystack = [option.label, option.description, option.group, ...(option.keywords ?? [])]
        .filter((part): part is string => Boolean(part))
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(normalized);
    });
  }, [options, query, selectedOption?.label]);

  useEffect(() => {
    if (!open || filtered.length === 0) {
      setActiveIndex(-1);
      return;
    }
    const firstEnabled = filtered.findIndex((option) => !option.disabled);
    setActiveIndex(firstEnabled);
  }, [filtered, open]);

  const commit = (option: ComboboxOption | undefined) => {
    const nextValue = option?.value ?? "";
    if (!isControlled) setInternalValue(nextValue);
    setQuery(option?.label ?? "");
    setOpen(false);
    onValueChange?.(nextValue, option);
    queueMicrotask(() => inputRef.current?.focus());
  };

  const move = (direction: 1 | -1) => {
    if (filtered.length === 0) return;
    let next = activeIndex;
    for (let index = 0; index < filtered.length; index += 1) {
      next = (next + direction + filtered.length) % filtered.length;
      if (!filtered[next]?.disabled) {
        setActiveIndex(next);
        return;
      }
    }
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    setQuery(event.currentTarget.value);
    setOpen(true);
  };

  return (
    <div className={cx("vz-combobox", className)} ref={rootRef}>
      <label className="vz-field__label" htmlFor={inputId}>{label}</label>
      <div className="vz-combobox__control">
        <input
          {...inputProps}
          ref={inputRef}
          id={inputId}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-required={required || undefined}
          autoComplete="off"
          value={query}
          placeholder={placeholder}
          disabled={disabled}
          className="vz-input"
          onChange={onInputChange}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setOpen(true);
              move(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setOpen(true);
              move(-1);
            } else if (event.key === "Home" && open) {
              event.preventDefault();
              setActiveIndex(filtered.findIndex((option) => !option.disabled));
            } else if (event.key === "End" && open) {
              event.preventDefault();
              for (let index = filtered.length - 1; index >= 0; index -= 1) {
                if (!filtered[index]?.disabled) {
                  setActiveIndex(index);
                  break;
              }
              }
            } else if (event.key === "Enter" && open && activeIndex >= 0) {
              event.preventDefault();
              const option = filtered[activeIndex];
              if (option && !option.disabled) commit(option);
            } else if (event.key === "Escape") {
              event.preventDefault();
              setQuery(selectedOption?.label ?? "");
              setOpen(false);
          } else if (event.key === "Tab") {
              setOpen(false);
            }
          }}
        />
        {selectedValue ? (
          <button type="button" className="vz-combobox__clear" aria-label={clearLabel} onClick={() => commit(undefined)}>×</button>
        ) : null}
        <button
          type="button"
          className="vz-combobox__toggle"
          aria-label={open ? "Close options" : "Open options"}
          aria-controls={listboxId}
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => !current);
            inputRef.current?.focus();
          }}
        >
          <span aria-hidden="true">⌄</span>
        </button>
      </div>
      <input type="hidden" name={inputProps.name} value={selectedValue} />
      {open ? (
        <div className="vz-combobox__popover">
          <div id={listboxId} role="listbox" aria-label={`${label} options`} className="vz-combobox__list">
            {filtered.length === 0 ? <p className="vz-combobox__empty">{noResultsText}</p> : null}
            {filtered.map((option, index) => {
              const selected = option.value === selectedValue;
              return (
                <div
                  id={`${listboxId}-${index}`}
                  key={option.value}
                  role="option"
                  aria-selected={selected}
                  aria-disabled={option.disabled || undefined}
                  className={cx(
                    "vz-combobox__option",
                    index === activeIndex && "is-active",
                    selected && "is-selected",
                    option.disabled && "is-disabled",
                  )}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => !option.disabled && setActiveIndex(index)}
                  onClick={() => !option.disabled && commit(option)}
                >
                  {renderOption ? renderOption(option, selected) : (
                    <>
                      <span><strong>{option.label}</strong>{option.description ? <small>{option.description}</small> : null}</span>
                      {selected ? <span aria-hidden="true">✓</span> : null}
                    </>
                  )}
                </div>
             );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
