"use client";

import { useState } from "react";
import type { FormEvent } from "react";

interface InvitationResult {
  readonly invitationId: string;
  readonly deliveryStatus: "queued";
  readonly expiresAt: string;
}

export function TenantOwnerInvitationForm() {
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "submitting") return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus("submitting");
    setMessage("");
    try {
      const response = await fetch("/api/membership-invitations/tenant-owners", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: data.get("email"), expiresInDays: Number(data.get("expiresInDays")) }),
      });
      const payload = await response.json() as unknown;
      if (!response.ok) {
        const message = typeof payload === "object" && payload !== null && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : "The invitation could not be queued.";
        throw new Error(message);
      }
      if (typeof payload !== "object" || payload === null || !("invitationId" in payload) || !("deliveryStatus" in payload) || !("expiresAt" in payload) || payload.deliveryStatus !== "queued" || typeof payload.invitationId !== "string" || typeof payload.expiresAt !== "string") {
        throw new Error("The invitation service returned an invalid response.");
      }
      const result: InvitationResult = { invitationId: payload.invitationId, deliveryStatus: "queued", expiresAt: payload.expiresAt };
      setStatus("success");
      setMessage(`Invitation queued. It expires ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.expiresAt))}.`);
      form.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The invitation could not be queued.");
    }
  }

  return <form className="foundation-form" onSubmit={submit}>
    <label>Email address<input name="email" type="email" autoComplete="email" required placeholder="owner@institution.edu"/></label>
    <label>Invitation validity<select name="expiresInDays" defaultValue="7"><option value="1">1 day</option><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label>
    <p>The invitation is scoped to this tenant. Veza stores only a digest of the one-time token and queues delivery through the outbox.</p>
    <button type="submit" disabled={status === "submitting"}>{status === "submitting" ? "Queuing invitation…" : "Queue owner invitation"}</button>
    {message ? <div className={`form-status ${status}`} role="status" aria-live="polite">{message}</div> : null}
  </form>;
}
