import type { RefObject } from "react";

export type VezaDensity = "comfortable" | "compact" | "reduced";
export type VezaTone = "neutral" | "information" | "success" | "warning" | "critical";
export type VezaPlacement = "top" | "right" | "bottom" | "left";

export function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function joinIds(...values: Array<string | undefined>): string | undefined {
  const joined = values.filter((value): value is string => Boolean(value)).join(" ");
  return joined || undefined;
}

export function focusFirst(container: HTMLElement | null): void {
  if (!container) return;
  const target = container.querySelector<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
  );
  target?.focus();
}

export function trapTabKey(event: KeyboardEvent, container: HTMLElement | null): void {
  if (event.key !== "Tab" || !container) return;
  const items = Array.from(
    container.querySelectorAll<HTMLElement>(
      "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
    ),
  ).filter((item) => item.offsetParent !== null);
  if (items.length === 0) {
    event.preventDefault();
    return;
  }
  const first = items[0];
  const last = items.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last?.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first?.focus();
  }
}

export function containsRef(ref: RefObject<HTMLElement | null>, target: EventTarget | null): boolean {
  return target instanceof Node && Boolean(ref.current?.contains(target));
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
