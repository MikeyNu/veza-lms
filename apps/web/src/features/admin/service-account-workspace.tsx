"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type {
  ServiceAccountDirectory,
  ServiceAccountView,
} from "../../server/service-account-api";

interface SecretDisclosure {
  readonly clientId?: string;
  readonly clientSecret: string;
  readonly secretPrefix: string;
  readonly accountId: string;
  readonly operation: "created" | "rotated";
}

function formatDate(value: string | undefined): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function splitValues(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function mutation(
  operation: string,
  body: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/service-accounts/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Record<string, unknown> & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Service account change failed");
  return result;
}

function StatusPill({ status }: { status: ServiceAccountView["status"] }) {
  return <span className={`service-account-status ${status}`}>{status}</span>;
}

export function ServiceAccountWorkspace({
  directory,
  currentUserId,
}: {
  directory: ServiceAccountDirectory;
  currentUserId: string;
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(directory.items[0]?.id);
  const [secret, setSecret] = useState<SecretDisclosure>();
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const selected = directory.items.find((account) => account.id === selectedId);
  const summary = useMemo(() => ({
    active: directory.items.filter((account) => account.status === "active").length,
    suspended: directory.items.filter((account) => account.status === "suspended").length,
    used: directory.items.filter((account) => Boolean(account.lastUsedAt)).length,
  }), [directory.items]);

  async function run(operation: string, body: Readonly<Record<string, unknown>>) {
    setBusy(true);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await mutation(operation, body);
      router.refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Service account change failed");
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  async function createAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const result = await run("create", {
      principalUserId: String(values.get("principalUserId") ?? ""),
      displayName: String(values.get("displayName") ?? ""),
      scopes: splitValues(values.get("scopes")),
      allowedIpCidrs: splitValues(values.get("allowedIpCidrs")),
      tokenTtlSeconds: Number(values.get("tokenTtlSeconds") ?? 900),
    });
    if (!result || typeof result.clientSecret !== "string" || typeof result.id !== "string") return;
    setSelectedId(result.id);
    setSecret({
      accountId: result.id,
      clientId: typeof result.clientId === "string" ? result.clientId : undefined,
      clientSecret: result.clientSecret,
      secretPrefix: String(result.secretPrefix ?? result.clientSecret.slice(0, 10)),
      operation: "created",
    });
    setMessage("Service account created. Copy the credential before leaving this page.");
    form.reset();
  }

  async function rotateSecret(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const values = new FormData(event.currentTarget);
    const result = await run(`rotate:${selected.id}`, {
      reason: String(values.get("reason") ?? ""),
    });
    if (!result || typeof result.clientSecret !== "string") return;
    setSecret({
      accountId: selected.id,
      clientId: selected.clientId,
      clientSecret: result.clientSecret,
      secretPrefix: String(result.secretPrefix ?? result.clientSecret.slice(0, 10)),
      operation: "rotated",
    });
    setMessage("The previous secret was retired and the replacement is shown once below.");
    event.currentTarget.reset();
  }

  async function changeStatus(status: "active" | "suspended" | "retired") {
    if (!selected) return;
    const reason = window.prompt(
      status === "retired"
        ? "Record why this account is being permanently retired."
        : `Record why this account is being set to ${status}.`,
    );
    if (!reason || reason.trim().length < 10) {
      setError("A reason of at least 10 characters is required.");
      return;
    }
    const result = await run(`status:${selected.id}`, { status, reason });
    if (result) setMessage(`Service account status changed to ${status}.`);
  }

  async function copy(value: string) {
    await navigator.clipboard.writeText(value);
    setMessage("Credential copied to the clipboard.");
  }

  return (
    <section className="service-account-workspace" aria-labelledby="service-account-title">
      <header className="service-account-heading">
        <div>
          <p className="admin-eyebrow">API ACCESS CONTROL</p>
          <h1 id="service-account-title">Service accounts</h1>
          <p>Issue narrowly scoped machine credentials, control source networks and retire access without sharing human passwords.</p>
        </div>
        <div className="service-account-trust-note">
          <strong>Secrets are shown once</strong>
          <span>Only salted hashes are retained after creation or rotation.</span>
        </div>
      </header>

      <section className="service-account-summary" aria-label="Service account summary">
        <div><small>Total identities</small><strong>{directory.items.length}</strong><span>Tenant scoped</span></div>
        <div><small>Active</small><strong>{summary.active}</strong><span>Token issuance allowed</span></div>
        <div><small>Suspended</small><strong>{summary.suspended}</strong><span>Immediate access stop</span></div>
        <div><small>Used</small><strong>{summary.used}</strong><span>At least one token request</span></div>
      </section>

      {secret ? (
        <section className="service-secret-disclosure" role="status" aria-live="polite">
          <div>
            <p className="admin-eyebrow">ONE-TIME CREDENTIAL</p>
            <h2>{secret.operation === "created" ? "New credential" : "Replacement credential"}</h2>
            <p>This value cannot be recovered after it is dismissed. Store it in the approved secrets manager.</p>
          </div>
          {secret.clientId ? (
            <label>Client ID<div><code>{secret.clientId}</code><button type="button" onClick={() => copy(secret.clientId!)}>Copy</button></div></label>
          ) : null}
          <label>Client secret<div><code>{secret.clientSecret}</code><button type="button" onClick={() => copy(secret.clientSecret)}>Copy</button></div></label>
          <button className="service-secret-dismiss" type="button" onClick={() => setSecret(undefined)}>I have stored this credential</button>
        </section>
      ) : null}

      {error ? <p className="admin-feedback error" role="alert">{error}</p> : null}
      {message ? <p className="admin-feedback success" role="status">{message}</p> : null}

      <div className="service-account-layout">
        <main className="service-account-directory">
          <div className="service-account-panel-heading">
            <div><p className="admin-eyebrow">MACHINE IDENTITIES</p><h2>Tenant directory</h2></div>
            <span>{directory.items.length} configured</span>
          </div>
          {directory.items.length === 0 ? (
            <div className="service-account-empty"><strong>No service accounts</strong><p>Create the first machine identity from the configuration panel.</p></div>
          ) : (
            <div className="service-account-table-wrap">
              <table className="service-account-table">
                <thead><tr><th>Identity</th><th>Principal</th><th>Scope</th><th>Last used</th><th>Status</th></tr></thead>
                <tbody>{directory.items.map((account) => (
                  <tr
                    key={account.id}
                    className={selected?.id === account.id ? "selected" : undefined}
                    onClick={() => setSelectedId(account.id)}
                  >
                    <td><button type="button" onClick={() => setSelectedId(account.id)}><strong>{account.displayName}</strong><code>{account.clientId}</code></button></td>
                    <td><strong>{account.principal.displayName ?? account.principal.email ?? "Tenant principal"}</strong><small>{account.principal.userId}</small></td>
                    <td><strong>{account.scopes.length}</strong><small>{account.scopes.slice(0, 2).join(", ") || "No scopes"}</small></td>
                    <td><time>{formatDate(account.lastUsedAt)}</time></td>
                    <td><StatusPill status={account.status}/></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </main>

        <aside className="service-account-operations">
          {selected ? (
            <section className="service-account-inspector">
              <div className="service-account-panel-heading">
                <div><p className="admin-eyebrow">SELECTED IDENTITY</p><h2>{selected.displayName}</h2></div>
                <StatusPill status={selected.status}/>
              </div>
              <dl>
                <div><dt>Client ID</dt><dd><code>{selected.clientId}</code></dd></div>
                <div><dt>Principal</dt><dd>{selected.principal.displayName ?? selected.principal.email ?? selected.principal.userId}</dd></div>
                <div><dt>Token lifetime</dt><dd>{selected.tokenTtlSeconds} seconds</dd></div>
                <div><dt>Active secret</dt><dd>{selected.activeSecret ? `${selected.activeSecret.prefix}… created ${formatDate(selected.activeSecret.createdAt)}` : "No active secret"}</dd></div>
                <div><dt>Allowed networks</dt><dd>{selected.allowedIpCidrs.length ? selected.allowedIpCidrs.join(", ") : "Any source address"}</dd></div>
              </dl>
              <div className="service-account-scope-list">
                <small>Granted scopes</small>
                <div>{selected.scopes.map((scope) => <span key={scope}>{scope}</span>)}</div>
              </div>
              <form onSubmit={rotateSecret} className="service-account-rotation">
                <label>Rotation reason<textarea name="reason" required minLength={10} maxLength={1000} placeholder="Scheduled credential rotation for the integration owner."/></label>
                <button type="submit" disabled={busy || selected.status !== "active"}>Rotate secret</button>
              </form>
              <div className="service-account-status-actions">
                {selected.status === "active" ? <button type="button" disabled={busy} onClick={() => changeStatus("suspended")}>Suspend</button> : null}
                {selected.status === "suspended" ? <button type="button" disabled={busy} onClick={() => changeStatus("active")}>Reactivate</button> : null}
                {selected.status !== "retired" ? <button className="critical" type="button" disabled={busy} onClick={() => changeStatus("retired")}>Retire permanently</button> : null}
              </div>
            </section>
          ) : null}

          <form className="service-account-create" onSubmit={createAccount}>
            <div className="service-account-panel-heading"><div><p className="admin-eyebrow">NEW IDENTITY</p><h2>Create service account</h2></div></div>
            <label>Display name<input name="displayName" required minLength={3} maxLength={160} placeholder="Student records synchronisation"/></label>
            <label>Principal user ID<input name="principalUserId" required defaultValue={currentUserId} pattern="[0-9a-fA-F-]{36}"/></label>
            <label>Scopes<textarea name="scopes" required placeholder="people.read&#10;enrolment.read"/></label>
            <label>Allowed IP CIDRs <span>optional</span><textarea name="allowedIpCidrs" placeholder="196.25.0.0/16&#10;10.20.0.0/24"/></label>
            <label>Token lifetime<select name="tokenTtlSeconds" defaultValue="900"><option value="300">5 minutes</option><option value="900">15 minutes</option><option value="1800">30 minutes</option><option value="3600">60 minutes</option></select></label>
            <button type="submit" disabled={busy}>{busy ? "Applying…" : "Create and reveal secret"}</button>
            <p>The selected principal must have an active tenant membership. Its existing policy assignments remain the final authorisation boundary.</p>
          </form>
        </aside>
      </div>
    </section>
  );
}
