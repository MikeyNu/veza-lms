"use client";

import { useState, type FormEvent } from "react";
import type { PersonSummary } from "@veza/contracts";
import { BulkSelectionToolbar } from "../../components/data/bulk-selection-toolbar";

export function PeopleBulkActions({
  selected,
  eligibleCount,
  onClear,
  onCompleted,
}: {
  readonly selected: readonly PersonSummary[];
  readonly eligibleCount: number;
  readonly onClear: () => void;
  readonly onCompleted: (message: string) => void;
}) {
  const [action, setAction] = useState<"active" | "inactive" | null>(null);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  function resetPanel() {
    setAction(null);
    setMessage("");
    setState("idle");
  }

  function close() {
    if (state !== "saving") resetPanel();
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!action) return;
    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    setState("saving");
    setMessage("");
    try {
      const response = await fetch("/api/people/bulk-status", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          records: selected.map((person) => ({ personId: person.id, expectedVersion: person.version })),
          status: action,
          reason,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { changedCount?: number; unchangedCount?: number; message?: string };
      if (!response.ok) throw new Error(body.message ?? "Bulk status change failed");
      const changed = Number(body.changedCount ?? 0);
      const unchanged = Number(body.unchangedCount ?? 0);
      resetPanel();
      onClear();
      onCompleted(`${changed} people updated${unchanged ? `, ${unchanged} already matched the selected status` : ""}.`);
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Bulk status change failed");
    }
  }

  return (
    <>
      <BulkSelectionToolbar
        selectedCount={selected.length}
        totalVisible={eligibleCount}
        label="People bulk actions"
        busy={state === "saving"}
        onClear={onClear}
      >
        <button type="button" onClick={() => setAction("active")} disabled={state === "saving"}>Set active</button>
        <button type="button" className="secondary" onClick={() => setAction("inactive")} disabled={state === "saving"}>Set inactive</button>
      </BulkSelectionToolbar>
      {action ? (
        <section className="bulk-confirmation-panel" role="dialog" aria-modal="false" aria-labelledby="people-bulk-confirmation-title">
          <header>
            <div><p>BULK LIFECYCLE CHANGE</p><h2 id="people-bulk-confirmation-title">Set {selected.length} people to {action}</h2></div>
            <button type="button" onClick={close} disabled={state === "saving"} aria-label="Close bulk confirmation">×</button>
          </header>
          <p>This command is atomic. Every selected version must still match, otherwise no record changes. Deceased and merged records are never eligible for this action.</p>
          <form onSubmit={submit}>
            <label>
              Operational reason
              <textarea name="reason" required minLength={20} maxLength={500} rows={3} placeholder="Explain why this lifecycle change applies to all selected records." />
            </label>
            {message ? <p className="bulk-action-error" role="alert">{message}</p> : null}
            <footer>
              <button type="button" className="secondary" onClick={close} disabled={state === "saving"}>Cancel</button>
              <button type="submit" disabled={state === "saving"}>{state === "saving" ? "Applying verified change..." : `Confirm ${action} status`}</button>
            </footer>
          </form>
        </section>
      ) : null}
    </>
  );
}
