"use client";

import {
  Button,
  Dialog,
  Drawer,
  DropdownMenu,
  Field,
  Select,
  TextInput,
  ValidationSummary,
} from "@veza/ui";
import { useRouter } from "next/navigation";
import { useMemo, useState, type FormEvent } from "react";
import type { BaselineRoleKey } from "@veza/contracts";
import type {
  AccessDirectoryPage,
  AccessInvitationRecord,
  AccessMembershipRecord,
} from "../../server/access-directory-api";
import type { InstitutionSummary } from "../../server/institution-setup-api";
import { BulkSelectionToolbar } from "../../components/data/bulk-selection-toolbar";

const roles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "auditor",
];

const tenantInviteRoles: readonly BaselineRoleKey[] = ["tenant-owner", "auditor"];
const tenantOwnerInstitutionInviteRoles: readonly BaselineRoleKey[] = [
  "institution-admin",
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "learner",
  "guardian-sponsor",
  "auditor",
];
const institutionAdminInviteRoles: readonly BaselineRoleKey[] = [
  "registrar",
  "curriculum-manager",
  "course-manager",
  "instructor",
  "assessor",
  "moderator",
  "learner",
  "guardian-sponsor",
  "auditor",
];

function human(value: string): string {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function date(value: string): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function inviteRolesFor(
  canUseTenantScope: boolean,
  scopeType: "tenant" | "institution",
): readonly BaselineRoleKey[] {
  if (scopeType === "tenant") return canUseTenantScope ? tenantInviteRoles : [];
  return canUseTenantScope ? tenantOwnerInstitutionInviteRoles : institutionAdminInviteRoles;
}

function preferredInviteRole(options: readonly BaselineRoleKey[]): BaselineRoleKey {
  return options.includes("instructor") ? "instructor" : options[0] ?? "auditor";
}

function selectedScope(form: FormData): { readonly scopeType: "tenant" | "institution"; readonly scopeId: string } {
  const encoded = String(form.get("scope") ?? "");
  const delimiter = encoded.indexOf(":");
  const scopeType = encoded.slice(0, delimiter);
  const scopeId = encoded.slice(delimiter + 1);
  if ((scopeType !== "tenant" && scopeType !== "institution") || !scopeId) {
    throw new Error("Access scope is invalid");
  }
  return { scopeType, scopeId };
}

async function mutate(operation: string, input: Readonly<Record<string, unknown>>) {
  const response = await fetch(`/api/access/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as { message?: string };
  if (!response.ok) throw new Error(body.message ?? "Access operation failed");
  return body;
}

function ScopeField({
  tenantId,
  institutions,
  canUseTenantScope,
}: {
  readonly tenantId: string;
  readonly institutions: readonly InstitutionSummary[];
  readonly canUseTenantScope: boolean;
}) {
  const defaultValue = canUseTenantScope
    ? `tenant:${tenantId}`
    : `institution:${institutions[0]?.id ?? ""}`;
  return (
    <label>
      Access scope
      <select name="scope" defaultValue={defaultValue} required>
        {canUseTenantScope ? <option value={`tenant:${tenantId}`}>All institutions in this tenant</option> : null}
        {institutions.map((institution) => (
          <option key={institution.id} value={`institution:${institution.id}`}>
            {institution.displayName}
          </option>
        ))}
      </select>
    </label>
  );
}

function InviteForm({
  tenantId,
  institutions,
  canUseTenantScope,
  onDone,
}: {
  readonly tenantId: string;
  readonly institutions: readonly InstitutionSummary[];
  readonly canUseTenantScope: boolean;
  readonly onDone: (message: string) => void;
}) {
  const initialScope = institutions[0]
    ? `institution:${institutions[0].id}`
    : canUseTenantScope
      ? `tenant:${tenantId}`
      : "";
  const initialScopeType = initialScope.startsWith("tenant:") ? "tenant" : "institution";
  const initialRole = preferredInviteRole(inviteRolesFor(canUseTenantScope, initialScopeType));
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  const [scope, setScope] = useState(initialScope);
  const [roleKey, setRoleKey] = useState<BaselineRoleKey>(initialRole);
  const scopeType = scope.startsWith("tenant:") ? "tenant" : "institution";
  const availableRoles = inviteRolesFor(canUseTenantScope, scopeType);
  const hasScope = scope.length > 0 && availableRoles.length > 0;

  function changeScope(value: string) {
    const nextScopeType = value.startsWith("tenant:") ? "tenant" : "institution";
    const nextRoles = inviteRolesFor(canUseTenantScope, nextScopeType);
    setScope(value);
    if (!nextRoles.includes(roleKey)) setRoleKey(preferredInviteRole(nextRoles));
    setMessage("");
    if (state === "error") setState("idle");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "saving") return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setState("saving");
    setMessage("");
    try {
      const selected = selectedScope(form);
      await mutate("invite", {
        email: String(form.get("email") ?? "").trim().toLowerCase(),
        roleKey: String(form.get("roleKey")),
        ...selected,
        expiresInDays: Number(form.get("expiresInDays")),
      });
      formElement.reset();
      setScope(initialScope);
      setRoleKey(initialRole);
      setState("idle");
      onDone("Invitation queued. The recipient can activate access after verifying the invited email address.");
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : "The invitation could not be queued.");
    }
  }

  return (
    <form className="access-invite-form" onSubmit={submit}>
      <ValidationSummary
        title="The invitation needs attention"
        issues={message ? [{ id: "invitation-submit", message }] : []}
        focusOnMount={state === "error"}
      />
      <Field label="Institution email address" description="This must match the verified email claim used during sign-in.">
        <TextInput name="email" type="email" autoComplete="email" inputMode="email" required maxLength={254} placeholder="person@institution.edu" />
      </Field>
      <Field label="Access scope" description={canUseTenantScope ? "Choose a specific institution for least-privilege access, or explicitly choose tenant-wide access." : "Your invitation is limited to an institution you administer."}>
        <Select name="scope" value={scope} required disabled={!initialScope} onChange={(event) => changeScope(event.currentTarget.value)}>
          {institutions.map((institution) => <option key={institution.id} value={`institution:${institution.id}`}>{institution.displayName}</option>)}
          {canUseTenantScope ? <option value={`tenant:${tenantId}`}>All institutions in this tenant</option> : null}
        </Select>
      </Field>
      <Field label="Role" description="Only roles delegable from the selected scope are shown. The API still rechecks authorization before creating the invitation.">
        <Select name="roleKey" value={roleKey} required disabled={!hasScope} onChange={(event) => setRoleKey(event.currentTarget.value as BaselineRoleKey)}>
          {availableRoles.map((role) => <option key={role} value={role}>{human(role)}</option>)}
        </Select>
      </Field>
      <Field label="Invitation validity" description="Seven days is the default. Resending later rotates the one-time token.">
        <Select name="expiresInDays" defaultValue="7" required><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></Select>
      </Field>
      {!hasScope ? <p className="access-error" role="alert">No delegable institution scope is available for this membership.</p> : null}
      <Button type="submit" loading={state === "saving"} disabled={!hasScope}>Send invitation</Button>
    </form>
  );
}

type MembershipAction = "assign" | "lifecycle" | null;

function MembershipInspector({
  membership,
  tenantId,
  institutions,
  canUseTenantScope,
  canChangeStatus,
  onDone,
}: {
  readonly membership: AccessMembershipRecord;
  readonly tenantId: string;
  readonly institutions: readonly InstitutionSummary[];
  readonly canUseTenantScope: boolean;
  readonly canChangeStatus: boolean;
  readonly onDone: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<MembershipAction>(null);
  const [endingRoleId, setEndingRoleId] = useState<string | null>(null);
  const [lifecycleStatus, setLifecycleStatus] = useState<"active" | "suspended" | "revoked">(membership.status === "active" ? "suspended" : "active");
  const endingRole = membership.roles.find((role) => role.id === endingRoleId);

  function openAction(next: Exclude<MembershipAction, null>) {
    setMessage("");
    if (next === "lifecycle") setLifecycleStatus(membership.status === "active" ? "suspended" : "active");
    setAction(next);
  }

  async function submit(operation: string, input: Readonly<Record<string, unknown>>, success: string): Promise<boolean> {
    setBusy(true);
    setMessage("");
    try {
      await mutate(operation, input);
      onDone(success);
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Access operation failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function assignRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const scope = selectedScope(form);
    const saved = await submit("role-assign", {
      membershipId: membership.id,
      roleKey: String(form.get("roleKey")),
      ...scope,
      ...(String(form.get("validUntil")) ? { validUntil: String(form.get("validUntil")) } : {}),
    }, "Role assignment created.");
    if (saved) setAction(null);
  }

  async function changeLifecycle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const saved = await submit("membership-status", {
      membershipId: membership.id,
      status: lifecycleStatus,
      reason: String(form.get("reason")),
    }, `Membership set to ${lifecycleStatus}.`);
    if (saved) setAction(null);
  }

  async function endRole(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!endingRole) return;
    const form = new FormData(event.currentTarget);
    const saved = await submit("role-end", { assignmentId: endingRole.id, reason: String(form.get("reason")) }, "Role assignment ended with audit evidence.");
    if (saved) setEndingRoleId(null);
  }

  return (
    <aside className="access-inspector">
      <header><p>MEMBERSHIP</p><h2>{membership.identity.displayName ?? membership.identity.email ?? "Verified identity"}</h2><span>{membership.identity.email ?? "No email claim"}</span></header>
      <dl><div><dt>Status</dt><dd>{human(membership.status)}</dd></div><div><dt>Locale</dt><dd>{membership.locale}</dd></div><div><dt>Timezone</dt><dd>{membership.timezone}</dd></div><div><dt>Created</dt><dd>{date(membership.createdAt)}</dd></div></dl>
      <section>
        <div className="access-section-heading"><h3>Current role assignments</h3><Button type="button" size="small" variant="secondary" onClick={() => openAction("assign")}>Assign role</Button></div>
        {membership.roles.length ? <ul className="access-role-list">{membership.roles.map((role) => <li key={role.id}><div><strong>{human(role.roleKey)}</strong><span>{role.scopeLabel ?? role.scopeId}</span><small>{role.validUntil ? `Ends ${date(role.validUntil)}` : "No scheduled end"}</small></div><Button type="button" size="small" variant="quiet" onClick={() => { setMessage(""); setEndingRoleId(role.id); }}>End role</Button></li>)}</ul> : <p className="access-empty-copy access-empty-copy--compact">No current roles.</p>}
      </section>
      {canChangeStatus ? <section className="access-lifecycle-summary"><div><h3>Membership lifecycle</h3><p>State changes are audited and require an explicit reason.</p></div><Button type="button" size="small" variant="secondary" onClick={() => openAction("lifecycle")}>Change status</Button></section> : null}
      {!action && !endingRole && message ? <p role="alert" className="access-error access-inspector-error">{message}</p> : null}

      <Dialog open={action === "assign"} onClose={() => setAction(null)} title="Assign role" description="Grant the selected membership a role at the narrowest appropriate access scope." size="small" footer={<><Button type="button" variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button><Button type="submit" form="access-assign-role-form" loading={busy} disabled={busy}>Assign role</Button></>}>
        <form id="access-assign-role-form" className="access-form compact" onSubmit={assignRole}><label>Role<select name="roleKey">{roles.map((role) => <option key={role} value={role}>{human(role)}</option>)}</select></label><ScopeField tenantId={tenantId} institutions={institutions} canUseTenantScope={canUseTenantScope} /><label>Valid until<input name="validUntil" type="datetime-local" /></label>{message ? <p role="alert" className="access-error">{message}</p> : null}</form>
      </Dialog>

      <Dialog open={action === "lifecycle"} onClose={() => setAction(null)} title="Change membership status" description={lifecycleStatus === "revoked" ? "Revocation is a high-impact access change. The server will recheck tenant-owner authorization before applying it." : "Apply an audited membership lifecycle state and record the reason for the change."} size="small" destructive={lifecycleStatus === "revoked"} footer={<><Button type="button" variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button><Button type="submit" form="access-membership-lifecycle-form" variant={lifecycleStatus === "revoked" ? "danger" : "primary"} loading={busy} disabled={busy}>Apply status</Button></>}>
        <form id="access-membership-lifecycle-form" className="access-form compact" onSubmit={changeLifecycle}><label>Status<select name="status" value={lifecycleStatus} onChange={(event) => setLifecycleStatus(event.currentTarget.value as "active" | "suspended" | "revoked")}><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option></select></label><label>Reason<textarea name="reason" required minLength={20} maxLength={500} rows={3} placeholder="Explain why this membership state must change." /></label>{message ? <p role="alert" className="access-error">{message}</p> : null}</form>
      </Dialog>

      <Dialog open={Boolean(endingRole)} onClose={() => setEndingRoleId(null)} title="End role assignment" description={endingRole ? `End ${human(endingRole.roleKey)} access for this membership while preserving the assignment evidence.` : undefined} size="small" destructive footer={<><Button type="button" variant="secondary" onClick={() => setEndingRoleId(null)} disabled={busy}>Cancel</Button><Button type="submit" form="access-end-role-form" variant="danger" loading={busy} disabled={busy}>End assignment</Button></>}>
        <form id="access-end-role-form" className="access-form compact" onSubmit={endRole}><label>Reason<textarea name="reason" required minLength={20} maxLength={500} rows={3} placeholder="Explain why this role assignment must end." /></label>{message ? <p role="alert" className="access-error">{message}</p> : null}</form>
      </Dialog>
    </aside>
  );
}

type InvitationAction = "resend" | "revoke" | null;

function InvitationActions({ invitation, onDone }: { readonly invitation: AccessInvitationRecord; readonly onDone: (message: string) => void }) {
  const [action, setAction] = useState<InvitationAction>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function perform(operation: "invitation-resend" | "invitation-revoke", form: HTMLFormElement) {
    const data = new FormData(form);
    setBusy(true);
    setMessage("");
    try {
      await mutate(operation, { invitationId: invitation.id, reason: String(data.get("reason")), ...(operation === "invitation-resend" ? { expiresInDays: Number(data.get("expiresInDays")) } : {}) });
      setAction(null);
      onDone(operation === "invitation-resend" ? "Invitation token rotated and delivery queued." : "Invitation revoked.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Invitation operation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="access-invitation-actions">
      <DropdownMenu label={`Actions for ${invitation.email}`} trigger={<Button type="button" size="small" variant="quiet">Actions</Button>} entries={[{ key: "resend", label: "Resend invitation", onSelect: () => { setMessage(""); setAction("resend"); } }, { type: "separator", key: "divider" }, { key: "revoke", label: "Revoke invitation", destructive: true, onSelect: () => { setMessage(""); setAction("revoke"); } }]} />
      <Dialog open={action === "resend"} onClose={() => setAction(null)} title="Resend invitation" description={`Rotate the one-time token and resend access to ${invitation.email}.`} size="small" footer={<><Button type="button" variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button><Button type="submit" form={`access-resend-${invitation.id}`} loading={busy} disabled={busy}>Rotate and resend</Button></>}>
        <form id={`access-resend-${invitation.id}`} className="access-form compact" onSubmit={(event) => { event.preventDefault(); void perform("invitation-resend", event.currentTarget); }}><label>Invitation validity<select name="expiresInDays" defaultValue="7"><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option></select></label><label>Reason<textarea name="reason" required minLength={20} maxLength={500} rows={3} placeholder="Explain why the invitation needs a new token and delivery attempt." /></label>{message ? <p role="alert" className="access-error">{message}</p> : null}</form>
      </Dialog>
      <Dialog open={action === "revoke"} onClose={() => setAction(null)} title="Revoke invitation" description={`Revoke the active invitation for ${invitation.email}. The current token will no longer be accepted.`} size="small" destructive footer={<><Button type="button" variant="secondary" onClick={() => setAction(null)} disabled={busy}>Cancel</Button><Button type="submit" form={`access-revoke-${invitation.id}`} variant="danger" loading={busy} disabled={busy}>Revoke invitation</Button></>}>
        <form id={`access-revoke-${invitation.id}`} className="access-form compact" onSubmit={(event) => { event.preventDefault(); void perform("invitation-revoke", event.currentTarget); }}><label>Reason<textarea name="reason" required minLength={20} maxLength={500} rows={3} placeholder="Explain why this invitation must be revoked." /></label>{message ? <p role="alert" className="access-error">{message}</p> : null}</form>
      </Dialog>
    </div>
  );
}

export function AccessAdministrationWorkspace({
  directory,
  tenantId,
  institutions,
  tenantOwner,
}: {
  readonly directory: AccessDirectoryPage;
  readonly tenantId: string;
  readonly institutions: readonly InstitutionSummary[];
  readonly tenantOwner: boolean;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"memberships" | "invitations">("memberships");
  const [selectedMembershipId, setSelectedMembershipId] = useState(directory.memberships[0]?.id ?? "");
  const [selectedInvitationIds, setSelectedInvitationIds] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkError, setBulkError] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [message, setMessage] = useState("");
  const selectedMembership = directory.memberships.find((membership) => membership.id === selectedMembershipId);
  const selectedInvitations = useMemo(() => directory.invitations.filter((invitation) => selectedInvitationIds.has(invitation.id)), [directory.invitations, selectedInvitationIds]);

  function done(value: string) {
    setMessage(value);
    setBulkError("");
    setSelectedInvitationIds(new Set());
    setBulkOpen(false);
    setInviteOpen(false);
    router.refresh();
  }

  async function bulkRevoke(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBulkBusy(true);
    setBulkError("");
    try {
      await mutate("invitations-bulk-revoke", { invitationIds: selectedInvitations.map((invitation) => invitation.id), reason: String(form.get("reason")) });
      done(`${selectedInvitations.length} invitations revoked.`);
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "Bulk revocation failed");
    } finally {
      setBulkBusy(false);
    }
  }

  return (
    <div className="access-workspace">
      <header className="access-heading"><div><p>IDENTITY & ACCESS</p><h1>Membership and invitation directory</h1><span>Manage verified identities, delegated roles and invitation evidence without trusting browser-supplied tenant context.</span></div><nav aria-label="Access directory views"><button type="button" className={tab === "memberships" ? "active" : ""} onClick={() => setTab("memberships")}>Memberships <b>{directory.memberships.length}</b></button><button type="button" className={tab === "invitations" ? "active" : ""} onClick={() => setTab("invitations")}>Invitations <b>{directory.invitations.length}</b></button></nav></header>
      {message ? <p className="access-notice" role="status">{message}</p> : null}
      <section className="access-overview"><article><span>Active memberships</span><strong>{directory.memberships.filter((item) => item.status === "active").length}</strong><small>Current page</small></article><article><span>Pending invitations</span><strong>{directory.invitations.length}</strong><small>Active tokens only</small></article><article><span>Role assignments</span><strong>{directory.memberships.reduce((count, item) => count + item.roles.length, 0)}</strong><small>Current and effective</small></article><article><span>Assurance</span><strong>MFA</strong><small>Required for changes</small></article></section>
      {tab === "memberships" ? <section className="access-layout"><div className="access-directory"><header><div><p>MEMBERSHIP REGISTER</p><h2>Verified identities</h2></div><span>{directory.memberships.length} shown</span></header>{directory.memberships.length ? <div className="access-table-wrap"><table><thead><tr><th>Identity</th><th>Status</th><th>Roles</th><th>Created</th></tr></thead><tbody>{directory.memberships.map((membership) => <tr key={membership.id} className={membership.id === selectedMembershipId ? "selected" : ""}><td><button className="access-member-select" type="button" onClick={() => setSelectedMembershipId(membership.id)} aria-pressed={membership.id === selectedMembershipId}><strong>{membership.identity.displayName ?? "Verified identity"}</strong><small>{membership.identity.email ?? membership.userId}</small></button></td><td><span className={`access-status ${membership.status}`}>{human(membership.status)}</span></td><td>{membership.roles.length}</td><td>{date(membership.createdAt)}</td></tr>)}</tbody></table></div> : <p className="access-empty-copy">No memberships match this scope.</p>}</div>{selectedMembership ? <MembershipInspector key={selectedMembership.id} membership={selectedMembership} tenantId={tenantId} institutions={institutions} canUseTenantScope={tenantOwner} canChangeStatus={tenantOwner} onDone={done} /> : null}</section> : <section className="access-invitation-grid"><div className="access-directory"><header><div><p>ACTIVE INVITATIONS</p><h2>Delivery and acceptance queue</h2></div><div className="access-directory-header-actions"><span>{directory.invitations.length} active</span><Button size="small" type="button" onClick={() => setInviteOpen(true)}>Invite access</Button></div></header><BulkSelectionToolbar selectedCount={selectedInvitationIds.size} totalVisible={directory.invitations.length} label="Invitation bulk actions" onClear={() => setSelectedInvitationIds(new Set())}><Button type="button" size="small" variant="danger" onClick={() => { setBulkError(""); setBulkOpen(true); }}>Revoke selected</Button></BulkSelectionToolbar>{directory.invitations.length ? <div className="access-table-wrap"><table><thead><tr><th className="people-select-column"><span className="sr-only">Select</span></th><th>Email</th><th>Role and scope</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead><tbody>{directory.invitations.map((invitation) => <tr key={invitation.id}><td className="people-select-column"><input type="checkbox" checked={selectedInvitationIds.has(invitation.id)} onChange={() => setSelectedInvitationIds((current) => { const next = new Set(current); if (next.has(invitation.id)) next.delete(invitation.id); else next.add(invitation.id); return next; })} aria-label={`Select invitation for ${invitation.email}`} /></td><td><strong>{invitation.email}</strong><small>Created {date(invitation.createdAt)}</small></td><td><strong>{human(invitation.roleKey)}</strong><small>{invitation.scopeLabel ?? invitation.scopeId}</small></td><td><span className={`access-status ${invitation.status}`}>{human(invitation.status)}</span></td><td>{date(invitation.expiresAt)}</td><td><InvitationActions invitation={invitation} onDone={done} /></td></tr>)}</tbody></table></div> : <p className="access-empty-copy">No active invitations.</p>}</div></section>}
      <Drawer open={inviteOpen} title="Invite access" description="Choose the verified email, delegated role, access scope and invitation validity." onClose={() => setInviteOpen(false)} width="standard"><InviteForm tenantId={tenantId} institutions={institutions} canUseTenantScope={tenantOwner} onDone={done} /></Drawer>
      <Dialog open={bulkOpen} onClose={() => setBulkOpen(false)} title={`Revoke ${selectedInvitationIds.size} invitations`} description="This audited transaction fails without changing any invitation if a selected record is no longer active or delegable." size="small" destructive footer={<><Button type="button" variant="secondary" onClick={() => setBulkOpen(false)} disabled={bulkBusy}>Cancel</Button><Button type="submit" form="access-bulk-revoke-form" variant="danger" loading={bulkBusy} disabled={bulkBusy || selectedInvitationIds.size === 0}>Confirm revocation</Button></>}><form id="access-bulk-revoke-form" className="access-form compact" onSubmit={bulkRevoke}><label>Reason<textarea name="reason" required minLength={20} maxLength={500} rows={3} placeholder="Explain why this invitation set must be revoked." /></label>{bulkError ? <p role="alert" className="access-error">{bulkError}</p> : null}</form></Dialog>
    </div>
  );
}
