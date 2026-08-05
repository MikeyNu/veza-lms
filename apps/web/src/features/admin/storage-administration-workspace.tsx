"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { StorageAdministrationWorkspace } from "../../server/storage-api";

type Row = Readonly<Record<string, unknown>>;

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
    if (result) setMessage("Tenant storage quota and enforcement policy updated.");
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
    const values = new FormData(event.currentTarget);
    const result = await run(`accessibility:${text(selectedAsset, "id")}`, {
      altText: String(values.get("altText") ?? "") || undefined,
      caption: String(values.get("caption") ?? "") || undefined,
      transcript: String(values.get("transcript") ?? "") || undefined,
      expectedVersion: number(selectedAsset, "version"),
    });
    if (result) {
      setMessage("Accessibility evidence recorded against the selected asset version.");
      event.currentTarget.reset();
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
    }
  }

  async function withdrawConsent(consent: Row) {
    const reason = window.prompt("Record the withdrawal reason. This cannot be reversed.");
    if (!reason || reason.trim().length < 10) {
      setError("A withdrawal reason of at least 10 characters is required.");
      return;
    }
    const result = await run(`withdraw-consent:${text(consent, "id")}`, {
      expectedVersion: number(consent, "version"),
      reason,
    });
    if (result) setMessage("Recording consent withdrawn and evidence preserved.");
  }

  async function requestDeletion() {
    if (!selectedAsset) return;
    const reason = window.prompt("Record why this media asset must be deleted.");
    if (!reason || reason.trim().length < 10) {
      setError("A deletion reason of at least 10 characters is required.");
      return;
    }
    const result = await run(`delete:${text(selectedAsset, "id")}`, { reason });
    if (result) setMessage("Deletion request recorded. An independent MFA-authenticated approver is required.");
  }

  async function approveDeletion(request: Row) {
    const reason = window.prompt("Record the independent approval reason.");
    if (!reason || reason.trim().length < 10) {
      setError("An approval reason of at least 10 characters is required.");
      return;
    }
    const result = await run(`approve-deletion:${text(request, "id")}`, { reason });
    if (result) setMessage("Deletion approved. The worker will execute it after the cooling-off period.");
  }

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
          <small>{maximumStoredBytes ? `${Math.round(capacityRatio * 100)}% stored capacity used` : "Configure quota enforcement below"}</small>
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

      <section className="storage-config-grid">
        <div className="storage-config-panel">
          <header><div><p className="admin-eyebrow">OBJECT BOUNDARY</p><h2>Namespaces</h2></div><span>{workspace.namespaces.length}</span></header>
          <div className="storage-record-list">{workspace.namespaces.map((namespace) => (
            <article key={text(namespace, "id")}>
              <div><strong>{text(namespace, "namespace_key", "namespaceKey")}</strong><code>{text(namespace, "key_prefix", "keyPrefix")}</code></div>
              <div><small>{text(namespace, "residency_region", "residencyRegion")}</small><Status value={text(namespace, "status")}/></div>
            </article>
          ))}</div>
          <form onSubmit={createNamespace} className="storage-compact-form">
            <label>Namespace key<input name="namespaceKey" required pattern="[a-z][a-z0-9-]{1,79}" placeholder="learning-media"/></label>
            <label>Bucket key<input name="bucketKey" required placeholder="veza-production-media"/></label>
            <label>Residency region<input name="residencyRegion" required defaultValue="af-south-1"/></label>
            <label>KMS key reference<input name="kmsKeyReference" required placeholder="arn:aws:kms:af-south-1:..."/></label>
            <label>CDN domain<input name="cdnDomain" placeholder="media.institution.ac.za"/></label>
            <button disabled={busy === "namespace"}>Create namespace</button>
          </form>
        </div>

        <div className="storage-config-panel">
          <header><div><p className="admin-eyebrow">UPLOAD GOVERNANCE</p><h2>Storage policies</h2></div><span>{workspace.policies.length}</span></header>
          <div className="storage-record-list">{workspace.policies.map((policy) => (
            <article key={text(policy, "id")}>
              <div><strong>{text(policy, "policy_key", "policyKey")}</strong><small>{text(policy, "purpose")}</small></div>
              <div><small>{formatBytes(number(policy, "maximum_bytes", "maximumBytes"))}</small><Status value={text(policy, "status")}/></div>
            </article>
          ))}</div>
          <form onSubmit={createPolicy} className="storage-compact-form">
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
            <button disabled={busy === "policy"}>Create policy</button>
          </form>
        </div>

        <div className="storage-config-panel quota-panel">
          <header><div><p className="admin-eyebrow">CAPACITY POLICY</p><h2>Quota and cost guardrails</h2></div><Status value={text(quota, "enforcement") || "unconfigured"}/></header>
          <form onSubmit={updateQuota} className="storage-compact-form">
            <label>Maximum stored bytes<input name="maximumStoredBytes" type="number" required min="1" defaultValue={maximumStoredBytes || 536870912000}/></label>
            <label>Monthly egress bytes<input name="maximumMonthlyEgressBytes" type="number" required min="1" defaultValue={number(quota, "maximum_monthly_egress_bytes", "maximumMonthlyEgressBytes") || 1073741824000}/></label>
            <label>Monthly transcode seconds<input name="maximumMonthlyTranscodeSeconds" type="number" required min="0" defaultValue={number(quota, "maximum_monthly_transcode_seconds", "maximumMonthlyTranscodeSeconds") || 360000}/></label>
            <label>Enforcement<select name="enforcement" defaultValue={text(quota, "enforcement") || "hard"}><option value="observe">Observe</option><option value="soft">Warn</option><option value="hard">Block overage</option></select></label>
            <label>Warning threshold<input name="warningThreshold" type="number" min="0.01" max="1" step="0.01" defaultValue={number(quota, "warning_threshold", "warningThreshold") || 0.8}/></label>
            <button disabled={busy === "quota"}>Save quota policy</button>
          </form>
          <div className="storage-usage-list">{workspace.monthlyUsage.map((usage) => (
            <div key={`${text(usage, "usage_type", "usageType")}-${text(usage, "unit")}`}><span>{text(usage, "usage_type", "usageType").replaceAll("-", " ")}</span><strong>{number(usage, "quantity").toLocaleString("en-ZA")} {text(usage, "unit")}</strong><small>{text(usage, "currency")} {number(usage, "cost_amount", "costAmount").toFixed(2)}</small></div>
          ))}</div>
        </div>
      </section>

      <section className="storage-asset-layout">
        <main className="storage-assets-panel">
          <header><div><p className="admin-eyebrow">MEDIA REGISTER</p><h2>Assets and processing evidence</h2></div><span>{workspace.assets.length} recent</span></header>
          <form className="storage-upload" onSubmit={uploadFile}>
            <label>File<input type="file" name="file" required/></label>
            <label>Namespace<select name="namespaceId" required defaultValue=""><option value="" disabled>Select namespace</option>{activeNamespaces.map((namespace) => <option key={text(namespace, "id")} value={text(namespace, "id")}>{text(namespace, "namespace_key", "namespaceKey")}</option>)}</select></label>
            <label>Policy<select name="storagePolicyId" required defaultValue=""><option value="" disabled>Select policy</option>{activePolicies.map((policy) => <option key={text(policy, "id")} value={text(policy, "id")}>{text(policy, "policy_key", "policyKey")}</option>)}</select></label>
            <label>Purpose<input name="purpose" required placeholder="course.video"/></label>
            <button disabled={busy === "upload"}>{busy === "upload" ? "Uploading…" : "Upload media"}</button>
          </form>
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
              <form onSubmit={recordAccessibility} className="storage-accessibility-form">
                <h3>Accessibility evidence</h3>
                <label>Alternative text<textarea name="altText" maxLength={1000}/></label>
                <label>Caption or summary<textarea name="caption" maxLength={10000}/></label>
                <label>Transcript<textarea name="transcript" maxLength={1048576}/></label>
                <button disabled={busy?.startsWith("accessibility:")}>Record evidence</button>
              </form>
              <div className="storage-danger-zone">
                <strong>Controlled deletion</strong>
                <p>Deletion requires a reason, a cooling-off period and an independent MFA-authenticated approver.</p>
                <button type="button" disabled={busy?.startsWith("delete:") || bool(selectedAsset, "legal_hold", "legalHold")} onClick={requestDeletion}>Request deletion</button>
              </div>
            </>
          ) : <div className="storage-empty"><strong>Select an asset</strong><p>Asset evidence and controlled actions will appear here.</p></div>}
        </aside>
      </section>

      <section className="storage-governance-grid">
        <div className="storage-governance-panel">
          <header><div><p className="admin-eyebrow">RECORDING CONSENT</p><h2>Consent register</h2></div><span>{workspace.recordingConsents.length}</span></header>
          <form onSubmit={createConsent} className="storage-consent-form">
            <label>Institution ID<input name="institutionId" required defaultValue={institutionId}/></label>
            <label>Subject person ID<input name="subjectPersonId" required/></label>
            <label>Recording context<input name="recordingContext" required placeholder="Live lecture recording"/></label>
            <label>Purpose<textarea name="purpose" required minLength={10}/></label>
            <label>Decision<select name="state"><option value="granted">Granted</option><option value="declined">Declined</option></select></label>
            <label>Expires at<input name="expiresAt" type="datetime-local"/></label>
            <label>Capture method<input name="captureMethod" defaultValue="administrative-record"/></label>
            <label>Evidence reference<input name="evidenceReference" placeholder="Consent form or case reference"/></label>
            <button disabled={busy === "consent"}>Record consent</button>
          </form>
          <div className="storage-governance-list">{workspace.recordingConsents.map((consent) => (
            <article key={text(consent, "id")}>
              <div><strong>{text(consent, "recording_context", "recordingContext")}</strong><small>Person {text(consent, "subject_person_id", "subjectPersonId")}</small></div>
              <div><Status value={text(consent, "state")}/>{text(consent, "state") === "granted" ? <button type="button" onClick={() => withdrawConsent(consent)}>Withdraw</button> : null}</div>
            </article>
          ))}</div>
        </div>

        <div className="storage-governance-panel">
          <header><div><p className="admin-eyebrow">DELETION CONTROL</p><h2>Approval queue</h2></div><span>{pendingDeletions} pending</span></header>
          <div className="storage-governance-list deletion-list">{workspace.deletionRequests.length ? workspace.deletionRequests.map((request) => (
            <article key={text(request, "id")}>
              <div><strong>{text(request, "originalFilename", "original_filename")}</strong><small>{text(request, "reason")}</small><code>{text(request, "id")}</code></div>
              <div><Status value={text(request, "status")}/><small>Execute after {formatDate(field(request, "executeAfter", "execute_after"))}</small>{text(request, "status") === "requested" ? <button type="button" onClick={() => approveDeletion(request)}>Approve with MFA</button> : null}</div>
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
    </section>
  );
}
