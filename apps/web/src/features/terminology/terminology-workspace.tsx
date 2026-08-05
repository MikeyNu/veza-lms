"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  CanonicalTerminologyKey,
  ResolvedInstitutionTerminology,
  TerminologyVersion,
} from "@veza/contracts";

const keys: readonly CanonicalTerminologyKey[] = [
  "learner",
  "staff",
  "guardian",
  "sponsor",
  "programme",
  "qualification",
  "learning-path",
  "subject",
  "module",
  "course",
  "grade",
  "year",
  "level",
  "cohort",
  "class",
  "academic-period",
  "outcome",
  "competency",
];
const hierarchyTypes = [
  "qualification",
  "programme",
  "learning-path",
  "grade",
  "year",
  "level",
  "subject",
  "module",
  "course",
] as const;

function display(value: string): string {
  return value.replaceAll("-", " ").replaceAll("_", " ");
}

function date(value?: string): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

async function transition(
  versionId: string,
  action: "submit" | "approve",
  input: Record<string, unknown>,
) {
  const response = await fetch(`/api/terminology/${versionId}/${action}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Terminology operation failed");
}

function VersionAction({
  institutionId,
  version,
  canManage,
  canApprove,
}: {
  institutionId: string;
  version: TerminologyVersion;
  canManage: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  if (version.lifecycle === "draft" && canManage) {
    return (
      <div className="terminology-record-action">
        <button
          type="button"
          disabled={state === "saving"}
          onClick={async () => {
            setState("saving");
            setMessage("");
            try {
              await transition(version.id, "submit", {
                institutionId,
                expectedVersion: version.version,
              });
              router.refresh();
            } catch (error) {
              setState("error");
              setMessage(error instanceof Error ? error.message : "Submission failed");
            }
          }}
        >
          {state === "saving" ? "Submitting…" : "Submit for review"}
        </button>
        {message ? <small>{message}</small> : null}
      </div>
    );
  }
  if (version.lifecycle === "in_review" && canApprove) {
    return (
      <details className="terminology-record-action">
        <summary>Approve version</summary>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setState("saving");
            setMessage("");
            const form = new FormData(event.currentTarget);
            try {
              await transition(version.id, "approve", {
                institutionId,
                expectedVersion: version.version,
                effectiveFrom: form.get("effectiveFrom"),
                effectiveUntil: form.get("effectiveUntil") || undefined,
                approvalNotes: form.get("approvalNotes"),
              });
              router.refresh();
            } catch (error) {
              setState("error");
              setMessage(error instanceof Error ? error.message : "Approval failed");
            }
          }}
        >
          <label>
            Effective from
            <input name="effectiveFrom" type="date" required />
          </label>
          <label>
            Effective until
            <input name="effectiveUntil" type="date" />
          </label>
          <label>
            Approval notes
            <textarea name="approvalNotes" minLength={10} maxLength={2000} required />
          </label>
          {message ? <small>{message}</small> : null}
          <button disabled={state === "saving"}>
            {state === "saving" ? "Approving…" : "Approve terminology"}
          </button>
        </form>
      </details>
    );
  }
  return <span className={`terminology-state ${version.lifecycle}`}>{display(version.lifecycle)}</span>;
}

export function TerminologyWorkspace({
  institutionId,
  versions,
  resolved,
  canManage,
  canApprove,
}: {
  institutionId: string;
  versions: readonly TerminologyVersion[];
  resolved: ResolvedInstitutionTerminology;
  canManage: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const activeVersion = versions.find(
    (version) =>
      version.lifecycle === "approved" &&
      version.id === resolved.terminologyVersionId,
  );

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState("saving");
    setMessage("");
    const form = new FormData(event.currentTarget);
    const entries = keys.map((key) => ({
      canonicalKey: key,
      singularLabel: String(form.get(`singular:${key}`) ?? "").trim(),
      pluralLabel: String(form.get(`plural:${key}`) ?? "").trim(),
      shortLabel: String(form.get(`short:${key}`) ?? "").trim() || undefined,
    }));
    const programmeHierarchy = [1, 2, 3, 4]
      .map((levelOrder) => {
        const canonicalType = String(form.get(`hierarchy:${levelOrder}:type`) ?? "");
        if (!canonicalType) return null;
        return {
          levelOrder,
          canonicalType,
          singularLabel: String(
            form.get(`hierarchy:${levelOrder}:singular`) ?? "",
          ).trim(),
          pluralLabel: String(
            form.get(`hierarchy:${levelOrder}:plural`) ?? "",
          ).trim(),
          isRequired:
            form.get(`hierarchy:${levelOrder}:required`) === "on",
          minimumOccurrences: Number(
            form.get(`hierarchy:${levelOrder}:minimum`) ?? 0,
          ),
          maximumOccurrences:
            String(form.get(`hierarchy:${levelOrder}:maximum`) ?? "").trim() ||
            undefined,
        };
      })
      .filter(Boolean)
      .map((level) => ({
        ...level,
        maximumOccurrences:
          level?.maximumOccurrences === undefined
            ? undefined
            : Number(level.maximumOccurrences),
      }));
    try {
      const response = await fetch("/api/terminology", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          institutionId,
          locale: form.get("locale"),
          title: form.get("title"),
          description: form.get("description") || undefined,
          entries,
          programmeHierarchy,
        }),
      });
      const body = (await response.json()) as { message?: string };
      if (!response.ok) throw new Error(body.message ?? "Terminology pack could not be created");
      event.currentTarget.reset();
      setState("idle");
      router.refresh();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "Creation failed");
    }
  }

  return (
    <div className="terminology-workspace">
      <header className="terminology-heading">
        <div>
          <p>INSTITUTION MODEL</p>
          <h1>Terminology and academic hierarchy</h1>
          <span>
            Local language changes labels only. APIs, permissions and records retain canonical identifiers.
          </span>
        </div>
        <div className="terminology-boundary">
          <small>Resolved locale</small>
          <strong>{resolved.resolvedLocale}</strong>
          <span>{activeVersion ? `Version ${activeVersion.versionNumber}` : "Canonical defaults"}</span>
        </div>
      </header>

      <section className="terminology-metrics">
        <article>
          <span>Canonical labels</span>
          <strong>{keys.length}</strong>
          <small>Stable API keys</small>
        </article>
        <article>
          <span>Configured locales</span>
          <strong>{new Set(versions.map((version) => version.locale)).size}</strong>
          <small>Institution-owned</small>
        </article>
        <article>
          <span>Hierarchy levels</span>
          <strong>{resolved.programmeHierarchy.length}</strong>
          <small>Current effective model</small>
        </article>
        <article>
          <span>Approval state</span>
          <strong>{activeVersion ? "Approved" : "Default"}</strong>
          <small>{activeVersion ? date(activeVersion.effectiveFrom) : "No custom pack effective"}</small>
        </article>
      </section>

      <section className="terminology-layout">
        <article className="terminology-resolved">
          <header>
            <div>
              <p>CURRENT EFFECTIVE LANGUAGE</p>
              <h2>Canonical label resolution</h2>
            </div>
            <span>{resolved.resolvedLocale}</span>
          </header>
          <div className="terminology-label-table">
            <div className="terminology-label-head">
              <span>Canonical key</span>
              <span>Singular</span>
              <span>Plural</span>
              <span>Short</span>
            </div>
            {keys.map((key) => (
              <div key={key}>
                <code>{key}</code>
                <strong>{resolved.labels[key].singular}</strong>
                <span>{resolved.labels[key].plural}</span>
                <small>{resolved.labels[key].short ?? "—"}</small>
              </div>
            ))}
          </div>
        </article>

        <aside className="terminology-hierarchy">
          <header>
            <p>PROGRAMME MODEL</p>
            <h2>Effective hierarchy</h2>
          </header>
          <ol>
            {resolved.programmeHierarchy.map((level) => (
              <li key={`${level.levelOrder}-${level.canonicalType}`}>
                <b>{level.levelOrder}</b>
                <div>
                  <strong>{level.singularLabel}</strong>
                  <span>
                    <code>{level.canonicalType}</code> · {level.isRequired ? "required" : "optional"}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        </aside>
      </section>

      <section className="terminology-versions">
        <header>
          <div>
            <p>VERSION GOVERNANCE</p>
            <h2>Terminology packs</h2>
          </div>
          <span>{versions.length}</span>
        </header>
        {versions.length ? (
          <div className="terminology-version-list">
            {versions.map((version) => (
              <article key={version.id}>
                <div className="terminology-version-number">
                  <span>{version.locale}</span>
                  <strong>v{version.versionNumber}</strong>
                </div>
                <div>
                  <strong>{version.title}</strong>
                  <small>
                    {version.entries.length} labels · {version.programmeHierarchy.length} hierarchy levels
                  </small>
                </div>
                <dl>
                  <div>
                    <dt>Lifecycle</dt>
                    <dd>{display(version.lifecycle)}</dd>
                  </div>
                  <div>
                    <dt>Effective</dt>
                    <dd>{date(version.effectiveFrom)}</dd>
                  </div>
                </dl>
                <VersionAction
                  institutionId={institutionId}
                  version={version}
                  canManage={canManage}
                  canApprove={canApprove}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="terminology-empty">
            <strong>No custom terminology packs</strong>
            <p>Veza is using stable canonical defaults for this institution.</p>
          </div>
        )}
      </section>

      {canManage ? (
        <details className="terminology-create">
          <summary>
            <div>
              <p>NEW VERSION</p>
              <h2>Create a complete terminology pack</h2>
            </div>
            <b aria-hidden="true">＋</b>
          </summary>
          <form onSubmit={create}>
            <div className="terminology-create-meta">
              <label>
                Locale
                <input name="locale" defaultValue={resolved.resolvedLocale} pattern="[a-z]{2,3}(-[A-Z]{2})?" required />
              </label>
              <label>
                Version title
                <input name="title" required minLength={3} maxLength={160} />
              </label>
              <label>
                Description
                <textarea name="description" minLength={10} maxLength={2000} />
              </label>
            </div>

            <div className="terminology-edit-table">
              <div className="terminology-edit-head">
                <span>Canonical key</span>
                <span>Singular label</span>
                <span>Plural label</span>
                <span>Short label</span>
              </div>
              {keys.map((key) => (
                <div key={key}>
                  <code>{key}</code>
                  <input
                    name={`singular:${key}`}
                    defaultValue={resolved.labels[key].singular}
                    required
                    maxLength={80}
                    aria-label={`${key} singular label`}
                  />
                  <input
                    name={`plural:${key}`}
                    defaultValue={resolved.labels[key].plural}
                    required
                    maxLength={80}
                    aria-label={`${key} plural label`}
                  />
                  <input
                    name={`short:${key}`}
                    defaultValue={resolved.labels[key].short}
                    maxLength={40}
                    aria-label={`${key} short label`}
                  />
                </div>
              ))}
            </div>

            <fieldset className="terminology-hierarchy-editor">
              <legend>Programme hierarchy</legend>
              {[1, 2, 3, 4].map((levelOrder) => {
                const current = resolved.programmeHierarchy[levelOrder - 1];
                return (
                  <div key={levelOrder}>
                    <b>{levelOrder}</b>
                    <label>
                      Canonical type
                      <select
                        name={`hierarchy:${levelOrder}:type`}
                        defaultValue={current?.canonicalType ?? ""}
                      >
                        <option value="">Unused level</option>
                        {hierarchyTypes.map((type) => (
                          <option key={type} value={type}>
                            {display(type)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Singular
                      <input
                        name={`hierarchy:${levelOrder}:singular`}
                        defaultValue={current?.singularLabel}
                        maxLength={80}
                      />
                    </label>
                    <label>
                      Plural
                      <input
                        name={`hierarchy:${levelOrder}:plural`}
                        defaultValue={current?.pluralLabel}
                        maxLength={80}
                      />
                    </label>
                    <label>
                      Minimum
                      <input
                        name={`hierarchy:${levelOrder}:minimum`}
                        type="number"
                        min="0"
                        defaultValue={current?.minimumOccurrences ?? 0}
                      />
                    </label>
                    <label>
                      Maximum
                      <input
                        name={`hierarchy:${levelOrder}:maximum`}
                        type="number"
                        min="1"
                        defaultValue={current?.maximumOccurrences}
                      />
                    </label>
                    <label className="terminology-check">
                      <input
                        name={`hierarchy:${levelOrder}:required`}
                        type="checkbox"
                        defaultChecked={current?.isRequired ?? false}
                      />
                      Required
                    </label>
                  </div>
                );
              })}
            </fieldset>
            {message ? (
              <p className="people-error" role="alert">
                {message}
              </p>
            ) : null}
            <button type="submit" disabled={state === "saving"}>
              {state === "saving" ? "Creating version…" : "Create draft terminology pack"}
            </button>
          </form>
        </details>
      ) : null}
    </div>
  );
}
