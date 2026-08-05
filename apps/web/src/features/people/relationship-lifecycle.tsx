"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { PersonDetail } from "@veza/contracts";

export function RelationshipLifecycle({ person }: { person: PersonDetail }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [message, setMessage] = useState("");

  async function transition(
    relationshipId: string,
    version: number,
    action: "verify" | "revoke",
  ) {
    const reason = window.prompt(
      action === "verify"
        ? "Record the verification evidence or process used."
        : "Record why this relationship authority is being revoked.",
    );
    if (!reason || reason.trim().length < 20) {
      setMessage("A reason of at least 20 characters is required.");
      return;
    }

    setBusy(relationshipId);
    setMessage("");
    const response = await fetch(
      `/api/people/relationships/${relationshipId}/${action}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedVersion: version, reason }),
      },
    );
    const body = (await response.json()) as { message?: string };
    if (!response.ok) {
      setMessage(body.message ?? "Relationship could not be changed.");
      setBusy(undefined);
      return;
    }
    router.refresh();
  }

  if (person.relationships.length === 0) return null;

  return (
    <section className="person-panel relationship-lifecycle-panel">
      <header>
        <div>
          <p>RELATIONSHIP LIFECYCLE</p>
          <h2>Verification and revocation</h2>
        </div>
        <span>{person.relationships.length}</span>
      </header>
      {message ? (
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
                Version {relationship.version} · {relationship.status}
              </small>
            </div>
            <div className="relationship-lifecycle-actions">
              {relationship.status === "pending" ? (
                <button
                  disabled={busy === relationship.id}
                  onClick={() =>
                    transition(relationship.id, relationship.version, "verify")
                  }
                  type="button"
                >
                  Verify authority
                </button>
              ) : null}
              {relationship.status !== "revoked" ? (
                <button
                  className="danger"
                  disabled={busy === relationship.id}
                  onClick={() =>
                    transition(relationship.id, relationship.version, "revoke")
                  }
                  type="button"
                >
                  Revoke
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
