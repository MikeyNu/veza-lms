"use client";

import type { ReactNode } from "react";

export function BulkSelectionToolbar({
  selectedCount,
  totalVisible,
  label,
  busy = false,
  onClear,
  children,
}: {
  readonly selectedCount: number;
  readonly totalVisible: number;
  readonly label: string;
  readonly busy?: boolean;
  readonly onClear: () => void;
  readonly children: ReactNode;
}) {
  if (selectedCount === 0) return null;
  return (
    <section className="bulk-selection-toolbar" aria-label={label} aria-live="polite">
      <div>
        <strong>{selectedCount} selected</strong>
        <span>{selectedCount === totalVisible ? "All eligible records on this page" : `${totalVisible - selectedCount} eligible records remain on this page`}</span>
      </div>
      <div className="bulk-selection-actions">{children}</div>
      <button className="bulk-selection-clear" type="button" onClick={onClear} disabled={busy}>Clear selection</button>
    </section>
  );
}
