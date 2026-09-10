"use client";

import { Button, Field, Select, TextInput, ValidationSummary } from "@veza/ui";
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
        body: JSON.stringify({
          email: String(data.get("email") ?? "").trim().toLowerCase(),
          expiresInDays: Number(data.get("expiresInDays")),
        }),
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
      const result: InvitationResult = {
        invitationId: payload.invitationId,
        deliveryStatus: "queued",
        expiresAt: payload.expiresAt,
      };
      setStatus("success");
      setMessage(`Invitation queued. It expires ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.expiresAt))}.`);
      form.reset();
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "The invitation could not be queued.");
    }
  }

  return (
    <form className="foundation-form" onSubmit={submit}>
      <ValidationSummary
        title="The invitation needs attention"
        issues={status === "error" && message ? [{ id: "owner-invitation-submit", message }] : []}
        focusOnMount={status === "error"}
      />
      <Field
        label="Institution email address"
        description="The recipient must authenticate with this exact verified email address."
      >
        <TextInput
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          placeholder="owner@institution.edu"
        />
      </Field>
      <Field
        label="Invitation validity"
        description="Use the shortest practical window. A resend rotates the one-time token."
      >
        <Select name="expiresInDays" defaultValue="7" required>
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
          <option value="14">14 days</option>
          <option value="30">30 days</option>
        </Select>
      </Field>
      <p>The invitation is tenant-scoped, audited and delivered with a one-time activation token.</p>
      <Button type="submit" loading={status === "submitting"}>Send tenant-owner invitation</Button>
      {status === "success" && message ? <div className="form-status success" role="status" aria-live="polite">{message}</div> : null}
    </form>
  );
}
