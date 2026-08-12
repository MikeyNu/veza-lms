"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { Button, Icon } from "@veza/ui";

type JsonObject = Readonly<Record<string, unknown>>;
type OperationPath = string | ((form: FormData) => string);

function messageFromPayload(payload: unknown, fallback: string): string {
  if (
    payload !== null &&
    typeof payload === "object" &&
    "message" in payload &&
    typeof payload.message === "string" &&
    payload.message.trim()
  ) {
    return payload.message;
  }
  return fallback;
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

export async function requestJson(
  path: string,
  method: "GET" | "POST",
  input?: JsonObject,
  failureMessage = "Operation failed",
): Promise<unknown> {
  const response = await fetch(path, {
    method,
    ...(input
      ? {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(input),
        }
      : {}),
  });
  const payload = await readJson(response);
  if (!response.ok) {
    throw new Error(messageFromPayload(payload, `${failureMessage} (${response.status})`));
  }
  return payload;
}

export function requireJsonObject(value: unknown, message = "The server returned an invalid response"): JsonObject {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
  return value as JsonObject;
}

export function GovernedActionPanel({
  context,
  title,
  children,
  className,
}: {
  context: string;
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={className ? `governed-action-panel ${className}` : "governed-action-panel"}>
      <summary>
        <span>
          <small>{context}</small>
          <strong>{title}</strong>
        </span>
        <Icon name="plus" size="small" aria-hidden="true" />
      </summary>
      <div className="governed-action-panel__body">{children}</div>
    </details>
  );
}

export function GovernedOperationForm({
  path,
  institutionId,
  submitLabel,
  buildInput,
  children,
  className,
  errorClassName,
  onSuccess,
}: {
  path: OperationPath;
  institutionId: string;
  submitLabel: string;
  buildInput: (form: FormData) => JsonObject;
  children: ReactNode;
  className?: string;
  errorClassName?: string;
  onSuccess?: () => void;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setSaving(true);
    setMessage("");
    try {
      await requestJson(
        typeof path === "function" ? path(form) : path,
        "POST",
        { institutionId, ...buildInput(form) },
      );
      element.reset();
      onSuccess?.();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Operation failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className={className} onSubmit={submit}>
      {children}
      {message ? (
        <p className={errorClassName} role="alert">
          {message}
        </p>
      ) : null}
      <Button type="submit" loading={saving} disabled={saving}>
        {submitLabel}
      </Button>
    </form>
  );
}
