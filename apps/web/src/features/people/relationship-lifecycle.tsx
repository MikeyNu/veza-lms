"use client";

import type { PersonDetail } from "@veza/contracts";
import { Button, Dialog } from "@veza/ui";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

type Relationship = PersonDetail["relationships"][number];
type RelationshipAction = "verify" | "revoke";
type RelationshipTarget = Readonly<{
  relationship: Relationship;
  action: RelationshipAction;
}> | null;

export function RelationshipLifecycle({ person }: { person: PersonDetail }) {
  const router = useRouter();
  const [target, setTarget] = useState<RelationshipTarget>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  function openAction(relationship: Relationship, action: RelationshipAction) {
    if (!relationship.institutionId) {
      setMessage(
        "This legacy relationship has no institution scope and cannot be changed until it is reconciled.",
      );
      return;
    }
    setMessage("");
    setTarget({ relationship, action });
  }

  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !target.relationship.institutionId) return;

    const form = new FormData(event.currentTarget);
    const reason = String(form.get("reason") ?? "").trim();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(
        `/api/people/relationships/${target.relationship.id}/${target.action}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            institutionId: target.relationship.institutionId,
            expectedVersion: target.relationship.version,
            reason,
          }),
        },
      );
      const body = (await response.json()) as { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "Relationship could not be changed.");
        return;
      }
      setTarget(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Relationship could not be changed.");
    } finally {
      setBusy(false);
    }
  }

  if (person.relationships.length === 0) return null;

  const isRevocation = target?.action === "revoke";
  const targetLabel = target?.relationship.type.replaceAll("-", " ") ?? "relationship";

  return (
    <section className="person-panel relationship-lifecycle-panel">
      <header>
        <div>
          <p>RELATIONSHIP LIFECYCLE</p>
          <h2>Verification and revocation</h2>
        </div>
        <span>{person.relationships.length}</span>
      </header>
      {!target && message ? (
        <p className="people-error" role="alert">
          {message}
        </p>
      ) : null}
      <div className="relationship-lifecycle-list">
        {person.relationships.map((relationship) => (
          <article key={relationship.id}>
            <div>
              <strong>{relationship.type.replaceAll("-", " ")}</strong>
              <small>
                Version {relationship.version} · {relationship.status} ·{" "}
                {relationship.institutionId ?? "unscoped legacy record"}
              </small>
            </div>
            <div className="relationship-lifecycle-actions">
              {relationship.status === "pending" ? (
                <Button
                  size="small"
                  variant="secondary"
                  disabled={busy || !relationship.institutionId}
                  onClick={() => openAction(relationship, "verify")}
                  type="button"
                >
                  Verify authority
                </Button>
              ) : null}
              {relationship.status !== "revoked" ? (
                <Button
                  size="small"
                  variant="danger"
                  disabled={busy || !relationship.institutionId}
                  onClick={() => openAction(relationship, "revoke")}
                  type="button"
                >
                  Revoke
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>

      <Dialog
        open={target !== null}
        onClose={() => { if (!busy) { setMessage(""); setTarget(null); } }}
        title={isRevocation ? "Revoke relationship authority" : "Verify relationship authority"}
        description={isRevocation
          ? `Revoke ${targetLabel} authority and preserve the reason as lifecycle evidence.`
          : `Record the evidence used to verify this ${targetLabel} relationship before authority is activated.`}
        size="small"
        destructive={isRevocation}
        footer={
          <>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => { setMessage(""); setTarget(null); }}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="relationship-lifecycle-form"
              variant={isRevocation ? "danger" : "primary"}
              loading={busy}
              disabled={busy}
            >
              {isRevocation ? "Revoke authority" : "Verify authority"}
            </Button>
          </>
        }
      >
        <form id="relationship-lifecycle-form" className="relationship-lifecycle-dialog" onSubmit={transition}>
          <label>
            {isRevocation ? "Revocation reason" : "Verification evidence"}
            <textarea
              name="reason"
              required
              minLength={20}
              maxLength={2000}
              rows={4}
              placeholder={isRevocation
                ? "Explain why this relationship authority must be revoked."
                : "Describe the evidence or verification process used to establish this relationship."}
            />
          </label>
          {message ? <p className="people-error" role="alert">{message}</p> : null}
        </form>
      </Dialog>
    </section>
  );
}
