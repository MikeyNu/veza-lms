"use client";

import { Button, Dialog, Drawer } from "@veza/ui";
import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { StorageAdministrationWorkspace } from "../../server/storage-api";

type Row = Readonly<Record<string, unknown>>;
type StoragePanel = "namespace" | "policy" | "quota" | "upload" | "accessibility" | "consent" | null;
type StorageConfirmation =
  | { readonly type: "withdraw-consent"; readonly target: Row }
  | { readonly type: "request-deletion"; readonly target: Row }
  | { readonly type: "approve-deletion"; readonly target: Row }
  | null;

function field<T = unknown>(row: Row | null | undefined, ...keys: string[]): T | undefined {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key] as T;
  }
  return undefined;
}

function text(row: Row | null | undefined, ...keys: string[]): string {
  const value = field(row, ...keys);
  return value === undefined ? "" : String(value);
}

function number(row: Row | null | undefined, ...keys: string[]): number {
  const value = Number(field(row, ...keys) ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function bool(row: Row | null | undefined, ...keys: string[]): boolean {
  return Boolean(field(row, ...keys));
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let size = value / 1024;
  let unit = units[0];
  for (let index = 1; index < units.length && size >= 1024; index += 1) {
    size /= 1024;
    unit = units[index];
  }
  return `${size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${unit}`;
}

function formatDate(value: unknown): string {
  if (!value || !Number.isFinite(Date.parse(String(value)))) return "Not recorded";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(String(value)));
}

function split(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[\n,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

async function mutate(
  operation: string,
  body: Readonly<Record<string, unknown>>,
): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/storage/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = (await response.json()) as Record<string, unknown> & { message?: string };
  if (!response.ok) throw new Error(result.message ?? "Storage change failed");
  return result;
}

async function checksum(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function Status({ value }: { value: string }) {
  return <span className={`storage-status ${value || "unknown"}`}>{value || "unknown"}</span>;
}

export function StorageAdministrationWorkspace({
  workspace,
  institutionId,
}: {
  workspace: StorageAdministrationWorkspace;
  institutionId?: string;
}) {
  const router = useRouter();
  const [selectedAssetId, setSelectedAssetId] = useState(text(workspace.assets[0], "id"));
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();
  const [uploadProgress, setUploadProgress] = useState<string>();
  const [panel, setPanel] = useState<StoragePanel>(null);
  const [confirmation, setConfirmation] = useState<StorageConfirmation>(null);
  const selectedAsset = workspace.assets.find((asset) => text(asset, "id") === selectedAssetId);
  const quota = workspace.quota;
  const maximumStoredBytes = number(quota, "maximum_stored_bytes", "maximumStoredBytes");
  const capacityRatio = maximumStoredBytes > 0 ? workspace.storedBytes / maximumStoredBytes : 0;
  const readyAssets = workspace.assets.filter((asset) => text(asset, "status") === "ready").length;
  const failedJobs = workspace.processingJobs.filter((job) => ["failed", "dead-letter"].includes(text(job, "state"))).length;
  const pendingDeletions = workspace.deletionRequests.filter((request) => text(request, "status") === "requested").length;
  const activeConsents = workspace.recordingConsents.filter((consent) => text(consent, "state") === "granted").length;
  const activeNamespaces = useMemo(
    () => workspace.namespaces.filter((namespace) => text(namespace, "status") === "active"),
    [workspace.namespaces],
  );
  const activePolicies = useMemo(
    () => workspace.policies.filter((policy) => text(policy, "status") === "active"),
    [workspace.policies],
  );

  function closePanel() {
    if (!busy) setPanel(null);
  }

  async function run(operation: string, body: Readonly<Record<string, unknown>>) {
    setBusy(operation);
    setError(undefined);
    setMessage(undefined);
    try {
      const result = await mutate(operation, body);
      router.refresh();
      return result;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Storage change failed");
      return undefined;
    } finally {
      setBusy(undefined);
    }
  }

  async function createNamespace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const result = await run("namespace", {
      namespaceKey: String(values.get("namespaceKey") ?? ""),
      bucketKey: String(values.get("bucketKey") ?? ""),
      residencyRegion: String(values.get("residencyRegion") ?? ""),
      kmsKeyReference: String(values.get("kmsKeyReference") ?? ""),
      cdnDomain: String(values.get("cdnDomain") ?? "") || undefined,
    });
    if (result) {
      setMessage("Storage namespace created with a tenant-specific object prefix.");
      form.reset();
      setPanel(null);
    }
  }

  async function createPolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const profileText = String(values.get("processingProfile") ?? "{}").trim() || "{}";
    let processingProfile: Record<string, unknown>;
    try {
      processingProfile = JSON.parse(profileText) as Record<string, unknown>;
    } catch {
      setError("Processing profile must be valid JSON.");
      return;
    }
    const result = await run("policy", {
      policyKey: String(values.get("policyKey") ?? ""),
      purpose: String(values.get("purpose") ?? ""),
      allowedMediaTypes: split(values.get("allowedMediaTypes")),
      maximumBytes: Number(values.get("maximumBytes") ?? 0),
      requireChecksum: values.get("requireChecksum") === "on",
      requireMalwareScan: values.get("requireMalwareScan") === "on",
      requireAccessibilityEvidence: values.get("requireAccessibilityEvidence") === "on",
      retentionDays: values.get("retentionDays") ? Number(values.get("retentionDays")) : undefined,
      legalHoldCapable: values.get("legalHoldCapable") === "on",
      processingProfile,
    });
    if (result) {
      setMessage("Storage policy created and available to new uploads.");
      form.reset();
      setPanel(null);
    }
  }

  async function updateQuota(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const result = await run("quota", {
      maximumStoredBytes: Number(values.get("maximumStoredBytes") ?? 0),
      maximumMonthlyEgressBytes: Number(values.get("maximumMonthlyEgressBytes") ?? 0),
      maximumMonthlyTranscodeSeconds: Number(values.get("maximumMonthlyTranscodeSeconds") ?? 0),
      enforcement: String(values.get("enforcement") ?? "hard"),
      warningThreshold: Number(values.get("warningThreshold") ?? 0.8),
    });
    if (result) {
      setMessage("Tenant storage quota and enforcement policy updated.");
      setPanel(null);
    }
  }

  async function uploadFile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const file = values.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Select a non-empty file to upload.");
      return;
    }
    setBusy("upload");
    setError(undefined);
    setMessage(undefined);
    try {
      setUploadProgress("Calculating SHA-256 checksum");
      const digest = await checksum(file);
      setUploadProgress("Registering upload and checking policy");
      const registration = await mutate("upload", {
        institutionId: institutionId || undefined,
        namespaceId: String(values.get("namespaceId") ?? ""),
        storagePolicyId: String(values.get("storagePolicyId") ?? ""),
        purpose: String(values.get("purpose") ?? ""),
        originalFilename: file.name,
        mediaType: file.type || "application/octet-stream",
        byteSize: file.size,
        checksumSha256: digest,
        metadata: { source: "storage-administration", lastModified: file.lastModified },
      });
      const uploadUrl = String(registration.uploadUrl ?? "");
      const uploadSessionId = String(registration.uploadSessionId ?? "");
      if (!uploadUrl || !uploadSessionId) throw new Error("Object storage upload registration was incomplete");
      const requiredHeaders = (registration.requiredHeaders ?? {}) as Record<string, string>;
      setUploadProgress(`Uploading ${formatBytes(file.size)} directly to object storage`);
      const uploaded = await fetch(uploadUrl, {
        method: "PUT",
        headers: requiredHeaders,
        body: file,
      });
      if (!uploaded.ok) throw new Error(`Object storage rejected the upload with status ${uploaded.status}`);
      setUploadProgress("Recording upload evidence and starting processing");
      await mutate(`complete:${uploadSessionId}`, {
        acknowledgedBytes: file.size,
        checksumSha256: digest,
        expectedVersion: Number(registration.version ?? 1),
      });
      setMessage("Upload accepted. Verification, malware scanning and renditions are now queued.");
      form.reset();
      setPanel(null);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Media upload failed");
    } finally {
      setBusy(undefined);
      setUploadProgress(undefined);
    }
  }

  async function recordAccessibility(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedAsset) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const result = await run(`accessibility:${text(selectedAsset, "id")}`, {
      altText: String(values.get("altText") ?? "") || undefined,
      caption: String(values.get("caption") ?? "") || undefined,
      transcript: String(values.get("transcript") ?? "") || undefined,
      expectedVersion: number(selectedAsset, "version"),
    });
    if (result) {
      setMessage("Accessibility evidence recorded against the selected asset version.");
      form.reset();
      setPanel(null);
    }
  }

  async function createConsent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const result = await run("consent", {
      institutionId: String(values.get("institutionId") ?? ""),
      subjectPersonId: String(values.get("subjectPersonId") ?? ""),
      recordingContext: String(values.get("recordingContext") ?? ""),
      purpose: String(values.get("purpose") ?? ""),
      state: String(values.get("state") ?? "granted"),
      expiresAt: String(values.get("expiresAt") ?? "") || undefined,
      evidence: {
        captureMethod: String(values.get("captureMethod") ?? "administrative-record"),
        evidenceReference: String(values.get("evidenceReference") ?? ""),
      },
    });
    if (result) {
      setMessage("Recording-consent evidence captured.");
      form.reset();
      setPanel(null);
    }
  }

  async function submitConfirmation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirmation) return;
    const values = new FormData(event.currentTarget);
    const reason = String(values.get("reason") ?? "");
    let result: Record<string, unknown> | undefined;
    if (confirmation.type === "withdraw-consent") {
      result = await run(`withdraw-consent:${text(confirmation.target, "id")}`, {
        expectedVersion: number(confirmation.target, "version"),
        reason,
      });
      if (result) setMessage("Recording consent withdrawn and evidence preserved.");
    } else if (confirmation.type === "request-deletion") {
      result = await run(`delete:${text(confirmation.target, "id")}`, { reason });
      if (result) setMessage("Deletion request recorded. An independent MFA-authenticated approver is required.");
    } else {
      result = await run(`approve-deletion:${text(confirmation.target, "id")}`, { reason });
      if (result) setMessage("Deletion approved. The worker will execute it after the cooling-off period.");
    }
    if (result) setConfirmation(null);
  }

  const confirmationTitle = confirmation?.type === "withdraw-consent"
    ? "Withdraw recording consent"
    : confirmation?.type === "request-deletion"
      ? "Request controlled deletion"
      : "Approve controlled deletion";
  const confirmationDescription = confirmation?.type === "withdraw-consent"
    ? "Withdraw this consent while preserving the historical evidence and reason."
    : confirmation?.type === "request-deletion"
      ? "Record why this asset must be deleted. The request still requires the cooling-off period and an independent approval."
      : "Record the independent approval reason. MFA and the configured cooling-off period remain required by the server workflow.";
  const confirmationLabel = confirmation?.type === "withdraw-consent"
    ? "Withdraw consent"
    : confirmation?.type === "request-deletion"
      ? "Request deletion"
      : "Approve deletion";

  return (
    <section className="storage-administration" aria-labelledby="storage-title">
      <header className="storage-heading">
        <div>
          <p className="admin-eyebrow">MEDIA OPERATIONS</p>
          <h1 id="storage-title">Media and object storage</h1>
          <p>Control tenant namespaces, upload policy, accessibility evidence, recording consent, retention, deletion and cost boundaries.</p>
        </div>
        <div className="storage-capacity">
          <div><strong>{formatBytes(workspace.storedBytes)}</strong><span>{maximumStoredBytes ? `of ${formatBytes(maximumStoredBytes)}` : "No quota configured"}</span></div>
          <meter min="0" max="1" value={Math.min(1, capacityRatio)}>{Math.round(capacityRatio * 100)}%</meter>
          <small>{maximumStoredBytes ? `${Math.round(capacityRatio * 100)}% stored capacity used` : "Configure quota enforcement"}</small>
        </div>
      </header>

      <section className="storage-summary" aria-label="Storage operations summary">
        <div><small>Media assets</small><strong>{workspace.assets.length}</strong><span>{readyAssets} ready</span></div>
        <div><small>Pipeline exceptions</small><strong>{failedJobs}</strong><span>Failed or dead-letter jobs</span></div>
        <div><small>Active consents</small><strong>{activeConsents}</strong><span>Recording permission in force</span></div>
        <div><small>Deletion approvals</small><strong>{pendingDeletions}</strong><span>Awaiting independent review</span></div>
      </section>

      {error ? <p className="admin-feedback error" role="alert">{error}</p> : null}
      {message ? <p className="admin-feedback success" role="status">{message}</p> : null}
      {uploadProgress ? <p className="storage-progress" role="status"><span aria-hidden="true"/> {uploadProgress}</p> : null}

      <section className="storage-config-grid storage-config-grid--records">
        <div className="storage-config-panel">
          <header><div><p className="admin-eyebrow">OBJECT BOUNDARY</p><h2>Namespaces</h2></div><div className="storage-panel-header-actions"><span>{workspace.namespaces.length}</span><Button type="button" size="small" variant="secondary" onClick={() => setPanel("namespace")}>New namespace</Button></div></header>
          <div className="storage-record-list">{workspace.namespaces.map((namespace) => (
            <article key={text(namespace, "id")}>
              <div><strong>{text(namespace, "namespace_key", "namespaceKey")}</strong><code>{text(namespace, "key_prefix", "keyPrefix")}</code></div>
              <div><small>{text(namespace, "residency_region", "residencyRegion")}</small><Status value={text(namespace, "status")}/></div>
            </article>
          ))}</div>
        </div>

        <div className="storage-config-panel">
          <header><div><p className="admin-eyebrow">UPLOAD GOVERNANCE</p><h2>Storage policies</h2></div><div className="storage-panel-header-actions"><span>{workspace.policies.length}</span><Button type="button" size="small" variant="secondary" onClick={() => setPanel("policy")}>New policy</Button></div></header>
          <div className="storage-record-list">{workspace.policies.map((policy) => (
            <article key={text(policy, "id")}>
              <div><strong>{text(policy, "policy_key", "policyKey")}</strong><small>{text(policy, "purpose")}</small></div>
              <div><small>{formatBytes(number(policy, "maximum_bytes", "maximumBytes"))}</small><Status value={text(policy, "status")}/></div>
            </article>
          ))}</div>
        </div>

        <div className="storage-config-panel quota-panel">
          <header><div><p className="admin-eyebrow">CAPACITY POLICY</p><h2>Quota and cost guardrails</h2></div><div className="storage-panel-header-actions"><Status value={text(quota, "enforcement") || "unconfigured"}/><Button type="button" size="small" variant="secondary" onClick={() => setPanel("quota")}>Edit quota</Button></div></header>
          <div className="storage-usage-list">{workspace.monthlyUsage.map((usage) => (
            <div key={`${text(usage, "usage_type", "usageType")}-${text(usage, "unit")}`}><span>{text(usage, "usage_type", "usageType").replaceAll("-", " ")}</span><strong>{number(usage, "quantity").toLocaleString("en-ZA")} {text(usage, "unit")}</strong><small>{text(usage, "currency")} {number(usage, "cost_amount", "costAmount").toFixed(2)}</small></div>
          ))}</div>
        </div>
      </section>

      <section className="storage-asset-layout">
        <main className="storage-assets-panel">
          <header><div><p className="admin-eyebrow">MEDIA REGISTER</p><h2>Assets and processing evidence</h2></div><div className="storage-panel-header-actions"><span>{workspace.assets.length} recent</span><Button type="button" size="small" onClick={() => setPanel("upload")} disabled={!activeNamespaces.length || !activePolicies.length}>Upload media</Button></div></header>
          <div className="storage-asset-table-wrap">
            <table className="storage-asset-table">
              <thead><tr><th>Asset</th><th>Size</th><th>Malware</th><th>Accessibility</th><th>Updated</th><th>Status</th></tr></thead>
              <tbody>{workspace.assets.map((asset) => (
                <tr key={text(asset, "id")} className={selectedAssetId === text(asset, "id") ? "selected" : undefined} onClick={() => setSelectedAssetId(text(asset, "id"))}>
                  <td><button type="button" onClick={() => setSelectedAssetId(text(asset, "id"))}><strong>{text(asset, "original_filename", "originalFilename")}</strong><small>{text(asset, "media_type", "mediaType")} · {text(asset, "purpose")}</small></button></td>
                  <td>{formatBytes(number(asset, "byte_size", "byteSize"))}</td>
                  <td><Status value={text(asset, "malware_status", "malwareStatus")}/></td>
                  <td><Status value={text(asset, "accessibility_status", "accessibilityStatus")}/></td>
                  <td>{formatDate(field(asset, "updated_at", "updatedAt"))}</td>
                  <td><Status value={text(asset, "status")}/></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </main>

        <aside className="storage-asset-inspector">
          {selectedAsset ? (
            <>
              <header><div><p className="admin-eyebrow">SELECTED ASSET</p><h2>{text(selectedAsset, "original_filename", "originalFilename")}</h2></div><Status value={text(selectedAsset, "status")}/></header>
              <dl>
                <div><dt>Asset ID</dt><dd><code>{text(selectedAsset, "id")}</code></dd></div>
                <div><dt>Checksum</dt><dd><code>{text(selectedAsset, "checksum_sha256", "checksumSha256")}</code></dd></div>
                <div><dt>Retention</dt><dd>{formatDate(field(selectedAsset, "retained_until", "retainedUntil"))}</dd></div>
                <div><dt>Legal hold</dt><dd>{bool(selectedAsset, "legal_hold", "legalHold") ? "Active" : "Not applied"}</dd></div>
                <div><dt>Version</dt><dd>{number(selectedAsset, "version")}</dd></div>
              </dl>
              <section className="storage-inspector-actions">
                <div><strong>Asset evidence</strong><p>Accessibility evidence and controlled deletion stay attached to the selected asset.</p></div>
                <Button type="button" size="small" variant="secondary" onClick={() => setPanel("accessibility")}>Record accessibility</Button>
              </section>
              <div className="storage-danger-zone">
                <strong>Controlled deletion</strong>
                <p>Deletion requires a reason, a cooling-off period and an independent MFA-authenticated approver.</p>
                <Button type="button" size="small" variant="danger" disabled={busy?.startsWith("delete:") || bool(selectedAsset, "legal_hold", "legalHold")} onClick={() => setConfirmation({ type: "request-deletion", target: selectedAsset })}>Request deletion</Button>
              </div>
            </>
          ) : <div className="storage-empty"><strong>Select an asset</strong><p>Asset evidence and controlled actions will appear here.</p></div>}
        </aside>
      </section>

      <section className="storage-governance-grid">
        <div className="storage-governance-panel">
          <header><div><p className="admin-eyebrow">RECORDING CONSENT</p><h2>Consent register</h2></div><div className="storage-panel-header-actions"><span>{workspace.recordingConsents.length}</span><Button type="button" size="small" variant="secondary" onClick={() => setPanel("consent")}>Record consent</Button></div></header>
          <div className="storage-governance-list">{workspace.recordingConsents.map((consent) => (
            <article key={text(consent, "id")}>
              <div><strong>{text(consent, "recording_context", "recordingContext")}</strong><small>Person {text(consent, "subject_person_id", "subjectPersonId")}</small></div>
              <div><Status value={text(consent, "state")}/>{text(consent, "state") === "granted" ? <Button type="button" size="small" variant="quiet" onClick={() => setConfirmation({ type: "withdraw-consent", target: consent })}>Withdraw</Button> : null}</div>
            </article>
          ))}</div>
        </div>

        <div className="storage-governance-panel">
          <header><div><p className="admin-eyebrow">DELETION CONTROL</p><h2>Approval queue</h2></div><span>{pendingDeletions} pending</span></header>
          <div className="storage-governance-list deletion-list">{workspace.deletionRequests.length ? workspace.deletionRequests.map((request) => (
            <article key={text(request, "id")}>
              <div><strong>{text(request, "originalFilename", "original_filename")}</strong><small>{text(request, "reason")}</small><code>{text(request, "id")}</code></div>
              <div><Status value={text(request, "status")}/><small>Execute after {formatDate(field(request, "executeAfter", "execute_after"))}</small>{text(request, "status") === "requested" ? <Button type="button" size="small" variant="secondary" onClick={() => setConfirmation({ type: "approve-deletion", target: request })}>Approve with MFA</Button> : null}</div>
            </article>
          )) : <div className="storage-empty"><strong>No deletion requests</strong><p>The queue is clear.</p></div>}</div>
        </div>

        <div className="storage-governance-panel">
          <header><div><p className="admin-eyebrow">WORKER PIPELINE</p><h2>Processing jobs</h2></div><span>{workspace.processingJobs.length}</span></header>
          <div className="storage-governance-list">{workspace.processingJobs.slice(0, 30).map((job) => (
            <article key={text(job, "id")}>
              <div><strong>{text(job, "job_type", "jobType").replaceAll("-", " ")}</strong><small>{text(job, "original_filename", "originalFilename")}</small>{text(job, "last_error", "lastError") ? <code>{text(job, "last_error", "lastError")}</code> : null}</div>
              <div><Status value={text(job, "state")}/><small>{number(job, "attempts")}/{number(job, "maximum_attempts", "maximumAttempts")} attempts</small></div>
            </article>
          ))}</div>
        </div>
      </section>

      <Drawer open={panel === "namespace"} onClose={closePanel} title="Create storage namespace" description="Define the tenant object boundary, residency region and encryption reference." width="standard">
        <form onSubmit={createNamespace} className="storage-compact-form storage-overlay-form">
          <label>Namespace key<input name="namespaceKey" required pattern="[a-z][a-z0-9-]{1,79}" placeholder="learning-media"/></label>
          <label>Bucket key<input name="bucketKey" required placeholder="veza-production-media"/></label>
          <label>Residency region<input name="residencyRegion" required defaultValue="af-south-1"/></label>
          <label>KMS key reference<input name="kmsKeyReference" required placeholder="arn:aws:kms:af-south-1:..."/></label>
          <label>CDN domain<input name="cdnDomain" placeholder="media.institution.ac.za"/></label>
          <Button type="submit" loading={busy === "namespace"} disabled={Boolean(busy)}>Create namespace</Button>
        </form>
      </Drawer>

      <Drawer open={panel === "policy"} onClose={closePanel} title="Create storage policy" description="Define the upload, processing, retention and evidence requirements for a media purpose." width="wide">
        <form onSubmit={createPolicy} className="storage-compact-form storage-overlay-form">
          <label>Policy key<input name="policyKey" required placeholder="course.video.standard"/></label>
          <label>Purpose<input name="purpose" required placeholder="course.video"/></label>
          <label>Allowed media types<textarea name="allowedMediaTypes" required placeholder="video/mp4&#10;video/webm"/></label>
          <label>Maximum file bytes<input name="maximumBytes" type="number" required min="1" defaultValue="2147483648"/></label>
          <label>Retention days<input name="retentionDays" type="number" min="1" max="36500" defaultValue="2555"/></label>
          <label>Processing profile JSON<textarea name="processingProfile" defaultValue={'{"renditions":["720p","1080p"],"captions":true}'}/></label>
          <div className="storage-checks">
            <label><input type="checkbox" name="requireChecksum" defaultChecked/> Checksum</label>
            <label><input type="checkbox" name="requireMalwareScan" defaultChecked/> Malware scan</label>
            <label><input type="checkbox" name="requireAccessibilityEvidence" defaultChecked/> Accessibility</label>
            <label><input type="checkbox" name="legalHoldCapable" defaultChecked/> Legal hold</label>
          </div>
          <Button type="submit" loading={busy === "policy"} disabled={Boolean(busy)}>Create policy</Button>
        </form>
      </Drawer>

      <Drawer open={panel === "quota"} onClose={closePanel} title="Edit quota and cost guardrails" description="Set tenant storage, egress and transcode boundaries without obscuring the usage register." width="standard">
        <form onSubmit={updateQuota} className="storage-compact-form storage-overlay-form">
          <label>Maximum stored bytes<input name="maximumStoredBytes" type="number" required min="1" defaultValue={maximumStoredBytes || 536870912000}/></label>
          <label>Monthly egress bytes<input name="maximumMonthlyEgressBytes" type="number" required min="1" defaultValue={number(quota, "maximum_monthly_egress_bytes", "maximumMonthlyEgressBytes") || 1073741824000}/></label>
          <label>Monthly transcode seconds<input name="maximumMonthlyTranscodeSeconds" type="number" required min="0" defaultValue={number(quota, "maximum_monthly_transcode_seconds", "maximumMonthlyTranscodeSeconds") || 360000}/></label>
          <label>Enforcement<select name="enforcement" defaultValue={text(quota, "enforcement") || "hard"}><option value="observe">Observe</option><option value="soft">Warn</option><option value="hard">Block overage</option></select></label>
          <label>Warning threshold<input name="warningThreshold" type="number" min="0.01" max="1" step="0.01" defaultValue={number(quota, "warning_threshold", "warningThreshold") || 0.8}/></label>
          <Button type="submit" loading={busy === "quota"} disabled={Boolean(busy)}>Save quota policy</Button>
        </form>
      </Drawer>

      <Drawer open={panel === "upload"} onClose={closePanel} title="Upload media" description="Register, checksum and upload media directly to the approved object-storage namespace." width="standard">
        <form className="storage-upload storage-upload--drawer" onSubmit={uploadFile}>
          <label>File<input type="file" name="file" required/></label>
          <label>Namespace<select name="namespaceId" required defaultValue=""><option value="" disabled>Select namespace</option>{activeNamespaces.map((namespace) => <option key={text(namespace, "id")} value={text(namespace, "id")}>{text(namespace, "namespace_key", "namespaceKey")}</option>)}</select></label>
          <label>Policy<select name="storagePolicyId" required defaultValue=""><option value="" disabled>Select policy</option>{activePolicies.map((policy) => <option key={text(policy, "id")} value={text(policy, "id")}>{text(policy, "policy_key", "policyKey")}</option>)}</select></label>
          <label>Purpose<input name="purpose" required placeholder="course.video"/></label>
          <Button type="submit" loading={busy === "upload"} disabled={Boolean(busy)}>Upload media</Button>
        </form>
      </Drawer>

      <Drawer open={panel === "accessibility" && Boolean(selectedAsset)} onClose={closePanel} title="Record accessibility evidence" description={selectedAsset ? `Attach accessibility evidence to ${text(selectedAsset, "original_filename", "originalFilename")}.` : undefined} width="wide">
        <form onSubmit={recordAccessibility} className="storage-accessibility-form storage-overlay-form">
          <label>Alternative text<textarea name="altText" maxLength={1000}/></label>
          <label>Caption or summary<textarea name="caption" maxLength={10000}/></label>
          <label>Transcript<textarea name="transcript" maxLength={1048576}/></label>
          <Button type="submit" loading={Boolean(busy?.startsWith("accessibility:"))} disabled={Boolean(busy)}>Record evidence</Button>
        </form>
      </Drawer>

      <Drawer open={panel === "consent"} onClose={closePanel} title="Record recording consent" description="Capture the subject, purpose, decision and supporting evidence without displacing the consent register." width="standard">
        <form onSubmit={createConsent} className="storage-consent-form storage-overlay-form">
          <label>Institution ID<input name="institutionId" required defaultValue={institutionId}/></label>
          <label>Subject person ID<input name="subjectPersonId" required/></label>
          <label>Recording context<input name="recordingContext" required placeholder="Live lecture recording"/></label>
          <label>Purpose<textarea name="purpose" required minLength={10}/></label>
          <label>Decision<select name="state"><option value="granted">Granted</option><option value="declined">Declined</option></select></label>
          <label>Expires at<input name="expiresAt" type="datetime-local"/></label>
          <label>Capture method<input name="captureMethod" defaultValue="administrative-record"/></label>
          <label>Evidence reference<input name="evidenceReference" placeholder="Consent form or case reference"/></label>
          <Button type="submit" loading={busy === "consent"} disabled={Boolean(busy)}>Record consent</Button>
        </form>
      </Drawer>

      <Dialog
        open={confirmation !== null}
        onClose={() => { if (!busy) setConfirmation(null); }}
        title={confirmationTitle}
        description={confirmationDescription}
        size="small"
        destructive={confirmation?.type !== "approve-deletion"}
        footer={
          <>
            <Button type="button" variant="secondary" onClick={() => setConfirmation(null)} disabled={Boolean(busy)}>Cancel</Button>
            <Button type="submit" form="storage-confirmation-form" variant={confirmation?.type === "approve-deletion" ? "primary" : "danger"} loading={Boolean(busy)} disabled={Boolean(busy)}>{confirmationLabel}</Button>
          </>
        }
      >
        <form id="storage-confirmation-form" className="storage-confirmation-form" onSubmit={submitConfirmation}>
          <label>Reason<textarea name="reason" required minLength={10} maxLength={1000} rows={4} placeholder="Record the reason for this audited storage action." /></label>
        </form>
      </Dialog>
    </section>
  );
}
