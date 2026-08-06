"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
import type { PersonDirectoryPage, WorkspaceSession } from "@veza/contracts";
import type { PeopleFilters } from "../../server/people-api";
import { PeopleBulkActions } from "./people-bulk-actions";

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeZone: "Africa/Johannesburg" }).format(new Date(value));
}

function CreatePersonPanel() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const payload = {
      givenName: String(form.get("givenName") ?? ""),
      familyName: String(form.get("familyName") ?? ""),
      preferredName: String(form.get("preferredName") ?? "") || undefined,
      status: "active",
      contacts: String(form.get("email") ?? "")
        ? [{ type: "email", value: String(form.get("email")), label: "Primary", isPrimary: true }]
        : [],
    };
    try {
      const response = await fetch("/api/people", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { message?: string };
      if (!response.ok) throw new Error(result.message ?? "Person could not be created");
      event.currentTarget.reset();
      setOpen(false);
      setState("idle");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Person could not be created");
    }
  }

  return (
    <>
      <button className="people-primary" type="button" onClick={() => setOpen(true)}>Add person <span>＋</span></button>
      {open ? (
        <div className="people-modal-backdrop" role="presentation">
          <section className="people-modal" role="dialog" aria-modal="true" aria-labelledby="create-person-title">
            <header><div><p>NEW RECORD</p><h2 id="create-person-title">Add a person</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close">×</button></header>
            <form onSubmit={submit}>
              <label>Given names<input name="givenName" required minLength={1} maxLength={120} autoFocus /></label>
              <label>Family name<input name="familyName" required minLength={1} maxLength={120} /></label>
              <label>Preferred name<input name="preferredName" maxLength={120} /></label>
              <label>Primary email<input name="email" type="email" maxLength={320} /></label>
              {message ? <p className="people-error" role="alert">{message}</p> : null}
              <footer><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="submit" disabled={state === "saving"}>{state === "saving" ? "Creating..." : "Create record"}</button></footer>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function ImportPanel({ institutionId }: { readonly institutionId: string | undefined }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "checking" | "ready" | "committing" | "error">("idle");
  const [result, setResult] = useState<{ importId: string; totalRows: number; validRows: number; invalidRows: number; duplicateRows: number; errors: readonly { rowNumber: number; message: string }[] } | null>(null);
  const [message, setMessage] = useState("");

  async function dryRun() {
    const file = input.current?.files?.[0];
    if (!file || !institutionId) return;
    setState("checking");
    setMessage("");
    try {
      const csv = await file.text();
      const response = await fetch("/api/people/imports/dry-run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ institutionId, filename: file.name, csv }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Import validation failed");
      setResult(body);
      setState("ready");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Import validation failed");
    }
  }

  async function commit() {
    if (!result) return;
    setState("committing");
    try {
      const response = await fetch(`/api/people/imports/${result.importId}/commit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: "Verified by the institution administrator after reviewing the CSV dry-run results." }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message ?? "Import could not be committed");
      setResult(null);
      setState("idle");
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Import could not be committed");
    }
  }

  return (
    <section className="people-import">
      <div><p>BULK ONBOARDING</p><h2>CSV import workbench</h2><span>Dry-run every row before a single person record is committed.</span></div>
      <div className="people-import-controls"><input ref={input} type="file" accept=".csv,text/csv" aria-label="Select people CSV" /><button onClick={dryRun} disabled={!institutionId || state === "checking"}>{state === "checking" ? "Validating..." : "Run dry check"}</button></div>
      {message ? <p className="people-error" role="alert">{message}</p> : null}
      {result ? (
        <div className="people-import-result">
          <dl><div><dt>Total</dt><dd>{result.totalRows}</dd></div><div><dt>Valid</dt><dd>{result.validRows}</dd></div><div><dt>Invalid</dt><dd>{result.invalidRows}</dd></div><div><dt>Duplicates</dt><dd>{result.duplicateRows}</dd></div></dl>
          {result.errors.length ? <details><summary>Review {result.errors.length} validation errors</summary><ul>{result.errors.slice(0, 20).map((error, index) => <li key={`${error.rowNumber}-${index}`}>Row {error.rowNumber}: {error.message}</li>)}</ul></details> : null}
          <button onClick={commit} disabled={result.invalidRows > 0 || state === "committing"}>{state === "committing" ? "Committing..." : "Commit verified rows"}</button>
        </div>
      ) : null}
    </section>
  );
}

export function PeopleWorkspace({ page, filters, session }: { readonly page: PersonDirectoryPage; readonly filters: PeopleFilters; readonly session: WorkspaceSession }) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [notice, setNotice] = useState("");
  const eligible = page.items.filter((person) => person.status === "active" || person.status === "inactive");
  const selected = eligible.filter((person) => selectedIds.has(person.id));
  const allEligibleSelected = eligible.length > 0 && selected.length === eligible.length;

  const next = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.status) params.set("status", filters.status);
    if (filters.learnersOnly) params.set("learnersOnly", "true");
    if (filters.staffOnly) params.set("staffOnly", "true");
    if (page.page.nextCursor) params.set("cursor", page.page.nextCursor);
    return params.toString();
  }, [filters, page.page.nextCursor]);

  function toggle(personId: string) {
    setNotice("");
    setSelectedIds((current) => {
      const nextSelection = new Set(current);
      if (nextSelection.has(personId)) nextSelection.delete(personId);
      else nextSelection.add(personId);
      return nextSelection;
    });
  }

  function toggleAll() {
    setNotice("");
    setSelectedIds(allEligibleSelected ? new Set() : new Set(eligible.map((person) => person.id)));
  }

  function completed(message: string) {
    setNotice(message);
    router.refresh();
  }

  return (
    <div className="people-workspace">
      <header className="people-heading"><div><p>PEOPLE & RELATIONSHIPS</p><h1>Institution directory</h1><span>Canonical learner, staff and authorised-contact records with effective-dated evidence.</span></div><CreatePersonPanel /></header>
      <section className="people-metrics"><article><span>Visible records</span><strong>{page.items.length}</strong><small>Current page</small></article><article><span>Learners</span><strong>{page.items.filter((item) => item.learnerStatus).length}</strong><small>With learner profiles</small></article><article><span>Staff</span><strong>{page.items.filter((item) => item.staffStatus).length}</strong><small>With staff profiles</small></article><article><span>Data boundary</span><strong>Tenant</strong><small>RLS enforced</small></article></section>
      <form className="people-filters" method="get"><label><span>Search people</span><input name="search" defaultValue={filters.search} placeholder="Name, email or identifier" /></label><label><span>Status</span><select name="status" defaultValue={filters.status ?? ""}><option value="">All active records</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="deceased">Deceased</option></select></label><label className="people-check"><input type="checkbox" name="learnersOnly" value="true" defaultChecked={filters.learnersOnly} /><span>Learners only</span></label><label className="people-check"><input type="checkbox" name="staffOnly" value="true" defaultChecked={filters.staffOnly} /><span>Staff only</span></label><button type="submit">Apply</button><Link href="/people">Reset</Link></form>
      {notice ? <p className="bulk-action-notice" role="status">{notice}</p> : null}
      <PeopleBulkActions selected={selected} eligibleCount={eligible.length} onClear={() => setSelectedIds(new Set())} onCompleted={completed} />
      <section className="people-table-panel">
        <header><div><h2>People records</h2><p>Open a record to manage profiles, identifiers, guardians and disclosure authority.</p></div><span>{page.items.length} shown</span></header>
        {page.items.length ? (
          <div className="people-table-wrap"><table><thead><tr><th className="people-select-column"><input type="checkbox" checked={allEligibleSelected} onChange={toggleAll} aria-label="Select all eligible visible people" /></th><th>Person</th><th>Profiles</th><th>Identifier</th><th>Status</th><th>Updated</th><th><span className="sr-only">Open</span></th></tr></thead><tbody>{page.items.map((person) => {
            const eligibleForBulk = person.status === "active" || person.status === "inactive";
            return <tr key={person.id} className={selectedIds.has(person.id) ? "selected" : undefined}><td className="people-select-column"><input type="checkbox" checked={selectedIds.has(person.id)} disabled={!eligibleForBulk} onChange={() => toggle(person.id)} aria-label={eligibleForBulk ? `Select ${person.displayName}` : `${person.displayName} requires individual review`} /></td><td><div className="people-person"><span>{initials(person.displayName)}</span><div><strong>{person.displayName}</strong><small>{person.primaryEmail ?? "No primary email"}</small></div></div></td><td><div className="people-badges">{person.learnerStatus ? <em>LEARNER · {person.learnerStatus}</em> : null}{person.staffStatus ? <em>STAFF · {person.staffStatus}</em> : null}{!person.learnerStatus && !person.staffStatus ? <small>No institutional profile</small> : null}</div></td><td>{person.institutionalIdentifiers[0] ?? "Not assigned"}</td><td><span className={`people-status ${person.status}`}>{person.status}</span></td><td>{date(person.updatedAt)}</td><td><Link className="people-open" href={`/people/${person.id}`} aria-label={`Open ${person.displayName}`}>→</Link></td></tr>;
          })}</tbody></table></div>
        ) : <div className="people-empty"><strong>No people match this view</strong><p>Adjust the filters, add a person, or stage a verified CSV import.</p></div>}
        {page.page.nextCursor ? <Link className="people-next" href={`/people?${next}`}>View next page →</Link> : null}
      </section>
      <ImportPanel institutionId={session.membership.institutionIds[0]} />
    </div>
  );
}
