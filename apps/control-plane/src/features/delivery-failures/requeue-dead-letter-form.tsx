"use client";

import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";

const sensitiveText = /\b(?:authorization|access[_-]?token|refresh[_-]?token|id[_-]?token|client[_-]?secret|password|secret)\b\s*[:=]|\bBearer\s+/i;

type SubmissionState = "idle" | "submitting" | "completed" | "error";

function normalizeReason(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function errorMessage(status: number, fallback: string | undefined): string {
  if (fallback) return fallback;
  if (status === 409) return "The event state changed or this recovery is already being processed. Refresh the queue before continuing.";
  if (status === 404) return "This event is no longer available in the recovery queue.";
  if (status === 401 || status === 403) return "Your verified operator session is no longer authorised for this action.";
  return "The event could not be returned to the delivery queue.";
}

export function RequeueDeadLetterForm({ eventId, returnHref }: { eventId: string; returnHref: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [state, setState] = useState<SubmissionState>("idle");
  const [message, setMessage] = useState("");
  const idempotencyKey = useRef<string | null>(null);
  const requestReason = useRef<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedReason = normalizeReason(reason);
    if (normalizedReason.length < 20 || normalizedReason.length > 500) {
      setState("error");
      setMessage("Provide a specific operational reason between 20 and 500 characters.");
      return;
    }
    if (sensitiveText.test(normalizedReason)) {
      setState("error");
      setMessage("Remove credentials, tokens and secrets from the operational reason.");
      return;
    }
    if (!confirmed) {
      setState("error");
      setMessage("Confirm that the underlying delivery issue has been verified before requeueing.");
      return;
    }

    if (!idempotencyKey.current || requestReason.current !== normalizedReason) {
      idempotencyKey.current = `requeue:${crypto.randomUUID()}`;
      requestReason.current = normalizedReason;
    }
    const operationKey = idempotencyKey.current;
    setState("submitting");
    setMessage("");

    try {
      const response = await fetch(`/api/delivery-failures/${eventId}/requeue`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "idempotency-key": operationKey,
        },
        body: JSON.stringify({ reason: normalizedReason }),
      });
      const text = await response.text();
      let result: unknown;
      try {
        result = JSON.parse(text) as unknown;
      } catch {
        result = undefined;
      }
      const responseMessage = typeof result === "object" && result !== null && "message" in result && typeof result.message === "string"
        ? result.message
        : undefined;
      if (!response.ok) {
        setState("error");
        setMessage(errorMessage(response.status, responseMessage));
        if (response.status === 404 || response.status === 409) router.refresh();
        return;
      }

      setState("completed");
      setMessage("Event returned to the delivery queue. The worker will claim it as a new delivery attempt.");
      router.replace(returnHref as Route);
      router.refresh();
    } catch {
      setState("error");
      setMessage("The recovery service is unavailable. Retrying the same reason will reuse the operation key safely.");
    }
  }

  const normalizedLength = normalizeReason(reason).length;
  const canSubmit = normalizedLength >= 20 && normalizedLength <= 500 && confirmed && state !== "submitting" && state !== "completed";

  return (
    <form className="failure-requeue" onSubmit={submit}>
      <div className="failure-action-heading">
        <div>
          <p className="cp-eyebrow">CONTROLLED RECOVERY</p>
          <h3>Return event to queue</h3>
        </div>
        <span>Audited</span>
      </div>
      <label htmlFor={`reason-${eventId}`}>Operational reason</label>
      <p id={`reason-help-${eventId}`} className="failure-field-help">
        Reference the verified incident, remediation or provider recovery. Never paste credentials or event content.
      </p>
      <textarea
        id={`reason-${eventId}`}
        value={reason}
        onChange={(input) => {
          setReason(input.target.value);
          if (state === "error") {
            setState("idle");
            setMessage("");
          }
        }}
        minLength={20}
        maxLength={500}
        required
        aria-describedby={`reason-help-${eventId} reason-count-${eventId}`}
        placeholder="Example: EventBridge permission restored under incident INC-2047; test publication confirmed in af-south-1."
      />
      <div className="failure-reason-meta">
        <small id={`reason-count-${eventId}`}>{normalizedLength}/500 characters</small>
        <small>Reason is stored in platform and tenant audit evidence.</small>
      </div>
      <label className="failure-confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(input) => setConfirmed(input.target.checked)}
          required
        />
        <span>I verified the underlying delivery issue and understand this action does not change the academic transaction.</span>
      </label>
      <button disabled={!canSubmit} type="submit">
        {state === "submitting" ? "Returning event…" : state === "completed" ? "Event requeued" : "Return to delivery queue"}
      </button>
      <div className={`failure-message ${state === "error" ? "error" : state === "completed" ? "success" : ""}`} aria-live="polite">
        {message}
      </div>
    </form>
  );
}
