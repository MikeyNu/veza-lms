"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

function value(row: Readonly<Record<string, unknown>>, key: string): string {
  const current = row[key];
  return current === null || current === undefined ? "" : String(current);
}

export function StaffGradebookDirectory({
  gradebooks,
}: {
  gradebooks: readonly Readonly<Record<string, unknown>>[];
}) {
  return (
    <section className="vz-completion-workspace" aria-labelledby="staff-gradebooks-title">
      <header><div><p>STAFF GRADEBOOKS</p><h2 id="staff-gradebooks-title">Learner result registers</h2><span>Open a course-run matrix without mixing it with the learner’s published-only view.</span></div><strong>{gradebooks.length}</strong></header>
      <div className="vz-gradebook-directory">
        {gradebooks.map((gradebook) => (
          <Link key={value(gradebook, "courseRunId")} href={`/gradebook/${value(gradebook, "courseRunId")}`}>
            <small>{value(gradebook, "formulaVersion") ? `Formula v${value(gradebook, "formulaVersion")}` : "No active formula"}</small>
            <strong>{value(gradebook, "courseRunTitle")}</strong>
            <span>{value(gradebook, "activeLearnerCount")} learners · {value(gradebook, "itemCount")} items · {value(gradebook, "publishedResultCount")} published</span>
          </Link>
        ))}
      </div>
    </section>
  );
}

export function StaffGradebookWorkspace({
  gradebook,
}: {
  gradebook: Readonly<Record<string, unknown>>;
}) {
  const rows = Array.isArray(gradebook.rows)
    ? (gradebook.rows as Readonly<Record<string, unknown>>[])
    : [];
  const [query, setQuery] = useState("");
  const filtered = useMemo(
    () => rows.filter((row) => value(row, "learnerName").toLowerCase().includes(query.toLowerCase())),
    [rows, query],
  );
  const learners = [...new Set(filtered.map((row) => value(row, "learnerName")))];
  const items = [...new Map(filtered.map((row) => [value(row, "gradebookItemId"), value(row, "itemTitle")])).entries()];

  return (
    <div className="vz-learning-page vz-staff-gradebook">
      <header className="vz-page-heading"><div><p>STAFF GRADEBOOK</p><h1>{value(gradebook, "courseTitle")}</h1><span>Draft, published, excluded, exempt and corrected evidence remains distinct.</span></div><Link href="/assessments">Back to assessments</Link></header>
      <section className="vz-gradebook-toolbar"><label>Find learner<input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name" /></label><span>{learners.length} learners · {items.length} grade items</span></section>
      <div className="vz-gradebook-matrix" role="table" aria-label="Staff gradebook matrix">
        <div className="row head" role="row"><strong role="columnheader">Learner</strong>{items.map(([id, title]) => <strong key={id} role="columnheader">{title}</strong>)}</div>
        {learners.map((learnerName) => <div className="row" role="row" key={learnerName}><strong role="rowheader">{learnerName}</strong>{items.map(([itemId]) => { const result = filtered.find((row) => value(row,"learnerName")===learnerName && value(row,"gradebookItemId")===itemId); const score = result ? value(result,"overrideScore") || value(result,"score") : ""; const state = result ? value(result,"isExempt")==="true" ? "Exempt" : value(result,"isExcluded")==="true" ? "Excluded" : value(result,"isMissing")==="true" ? "Missing" : value(result,"state") || "Draft" : "Missing"; return <span role="cell" key={itemId}><b>{score || "—"}</b><small>{state}</small></span>; })}</div>)}
      </div>
    </div>
  );
}
