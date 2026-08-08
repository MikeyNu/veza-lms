import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { RefObject } from "react";

export type VezaDensity = "comfortable" | "compact" | "reduced";
export type VezaTone = "neutral" | "information" | "success" | "warning" | "critical";
export type VezaPlacement = "top" | "right" | "bottom" | "left";

/**
 * Canonical Veza class composer.
 *
 * clsx handles conditional composition while tailwind-merge prevents utility
 * conflicts when Veza components are extended at a call site. The public `cx`
 * alias remains for compatibility while existing modules migrate.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export const cx = cn;

export function joinIds(...values: Array<string | undefined>): string | undefined {
  const joined = values.filter((value): value is string => Boolean(value)).join(" ");
  return joined || undefined;
}

/**
 * Legacy focus helper retained only while pre-v2 composite controls migrate to
 * Radix primitives. New overlays must delegate focus management to Radix.
 */
export function focusFirst(container: HTMLElement | null): void {
  if (!container) return;
  const target = container.querySelector<HTMLElement>(
    "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
  );
  target?.focus();
}

/** @deprecated Radix-managed composites must not use manual focus trapping. */
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

/** @deprecated Prefer primitive-managed outside-interaction handling. */
export function containsRef(ref: RefObject<HTMLElement | null>, target: EventTarget | null): boolean {
  return target instanceof Node && Boolean(ref.current?.contains(target));
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}
