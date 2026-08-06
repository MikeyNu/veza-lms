"use client";

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

function human(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value));
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

function ScopeFields({ tenantId, institutions, canUseTenantScope }: { readonly tenantId: string; readonly institutions: readonly InstitutionSummary[]; readonly canUseTenantScope: boolean }) {
  const defaultInstitution = institutions[0]?.id ?? "";
  return (
    <>
      <label>Scope type<select name="scopeType" defaultValue={canUseTenantScope ? "tenant" : "institution"}><option value="institution">Institution</option>{canUseTenantScope ? <option value="tenant">Whole tenant</option> : null}</select></label>
      <label>Scope<select name="scopeId" defaultValue={canUseTenantScope ? tenantId : defaultInstitution}>{canUseTenantScope ? <option value={tenantId}>All institutions in this tenant</option> : null}{institutions.map((institution) => <option key={institution.id} value={institution.id}>{institution.displayName}</option>)}</select></label>
    </>
  );
}

function InviteForm({ tenantId, institutions, canUseTenantScope, onDone }: { readonly tenantId: string; readonly institutions: readonly InstitutionSummary[]; readonly canUseTenantScope: boolean; readonly onDone: (message: string) => void }) {
  const [state, setState] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setState("saving"); setMessage("");
    const form = new FormData(event.currentTarget);
    try {
      await mutate("invite", { email: String(form.get("email")), roleKey: String(form.get("roleKey")), scopeType: String(form.get("scopeType")), scopeId: String(form.get("scopeId")), expiresInDays: Number(form.get("expiresInDays")) });
      event.currentTarget.reset(); setState("idle"); onDone("Invitation queued with a one-time token and delivery evidence.");
    } catch (error) { setState("error"); setMessage(error instanceof Error ? error.message : "Invitation failed"); }
  }
  return <form className="access-form" onSubmit={submit}><label>Verified email<input type="email" name="email" required maxLength={254} /></label><label>Role<select name="roleKey" defaultValue="instructor">{roles.map((role) => <option key={role} value={role}>{human(role)}</option>)}</select></label><ScopeFields tenantId={tenantId} institutions={institutions} canUseTenantScope={canUseTenantScope} /><label>Expires in<select name="expiresInDays" defaultValue="7"><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></label>{message ? <p role="alert" className="access-error">{message}</p> : null}<button type="submit" disabled={state === "saving"}>{state === "saving" ? "Queueing invitation..." : "Queue invitation"}</button></form>;
}

function MembershipInspector({ membership, tenantId, institutions, canUseTenantScope, canChangeStatus, onDone }: { readonly membership: AccessMembershipRecord; readonly tenantId: string; readonly institutions: readonly InstitutionSummary[]; readonly canUseTenantScope: boolean; readonly canChangeStatus: boolean; readonly onDone: (message: string) => void }) {
  const [message, setMessage] = useState("");
  async function submit(operation: string, input: Readonly<Record<string, unknown>>, success: string) {
    setMessage("");
    try { await mutate(operation, input); onDone(success); } catch (error) { setMessage(error instanceof Error ? error.message : "Access operation failed"); }
  }
  return <aside className="access-inspector"><header><p>MEMBERSHIP</p><h2>{membership.identity.displayName ?? membership.identity.email ?? "Verified identity"}</h2><span>{membership.identity.email ?? "No email claim"}</span></header><dl><div><dt>Status</dt><dd>{human(membership.status)}</dd></div><div><dt>Locale</dt><dd>{membership.locale}</dd></div><div><dt>Timezone</dt><dd>{membership.timezone}</dd></div><div><dt>Created</dt><dd>{date(membership.createdAt)}</dd></div></dl><section><h3>Current role assignments</h3>{membership.roles.length ? <ul className="access-role-list">{membership.roles.map((role) => <li key={role.id}><div><strong>{human(role.roleKey)}</strong><span>{role.scopeLabel ?? role.scopeId}</span><small>{role.validUntil ? `Ends ${date(role.validUntil)}` : "No scheduled end"}</small></div><details><summary>End role</summary><form onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit("role-end", { assignmentId: role.id, reason: String(form.get("reason")) }, "Role assignment ended with audit evidence."); }}><textarea name="reason" required minLength={20} maxLength={500} rows={2} placeholder="Reason for ending this role" /><button>End assignment</button></form></details></li>)}</ul> : <p className="access-empty-copy">No current roles.</p>}</section><section><h3>Assign role</h3><form className="access-form compact" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void submit("role-assign", { membershipId: membership.id, roleKey: String(form.get("roleKey")), scopeType: String(form.get("scopeType")), scopeId: String(form.get("scopeId")), validUntil: String(form.get("validUntil")) || undefined }, "Role assignment created."); }}><label>Role<select name="roleKey">{roles.map((role) => <option key={role} value={role}>{human(role)}</option>)}</select></label><ScopeFields tenantId={tenantId} institutions={institutions} canUseTenantScope={canUseTenantScope} /><label>Valid until<input name="validUntil" type="datetime-local" /></label><button>Assign role</button></form></section>{canChangeStatus ? <section><h3>Membership lifecycle</h3><form className="access-form compact" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const status = String(form.get("status")); void submit("membership-status", { membershipId: membership.id, status, reason: String(form.get("reason")) }, `Membership set to ${status}.`); }}><label>Status<select name="status" defaultValue={membership.status === "active" ? "suspended" : "active"}><option value="active">Active</option><option value="suspended">Suspended</option><option value="revoked">Revoked</option></select></label><label>Reason<textarea name="reason" required minLength={20} maxLength={500} rows={2} /></label><button>Apply membership state</button></form></section> : null}{message ? <p role="alert" className="access-error">{message}</p> : null}</aside>;
}

function InvitationActions({ invitation, onDone }: { readonly invitation: AccessInvitationRecord; readonly onDone: (message: string) => void }) {
  const [message, setMessage] = useState("");
  async function perform(operation: "invitation-resend" | "invitation-revoke", form: HTMLFormElement) {
    const data = new FormData(form); setMessage("");
    try { await mutate(operation, { invitationId: invitation.id, reason: String(data.get("reason")), ...(operation === "invitation-resend" ? { expiresInDays: Number(data.get("expiresInDays")) } : {}) }); onDone(operation === "invitation-resend" ? "Invitation token rotated and delivery queued." : "Invitation revoked."); } catch (error) { setMessage(error instanceof Error ? error.message : "Invitation operation failed"); }
  }
  return <div className="access-invitation-actions"><details><summary>Resend</summary><form onSubmit={(event) => { event.preventDefault(); void perform("invitation-resend", event.currentTarget); }}><select name="expiresInDays" defaultValue="7"><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option></select><textarea name="reason" required minLength={20} maxLength={500} rows={2} placeholder="Reason for rotating and resending" /><button>Rotate and resend</button></form></details><details><summary>Revoke</summary><form onSubmit={(event) => { event.preventDefault(); void perform("invitation-revoke", event.currentTarget); }}><textarea name="reason" required minLength={20} maxLength={500} rows={2} placeholder="Reason for revocation" /><button>Revoke invitation</button></form></details>{message ? <p role="alert" className="access-error">{message}</p> : null}</div>;
}

export function AccessAdministrationWorkspace({ directory, tenantId, institutions, tenantOwner }: { readonly directory: AccessDirectoryPage; readonly tenantId: string; readonly institutions: readonly InstitutionSummary[]; readonly tenantOwner: boolean }) {
  const router = useRouter();
  const [tab, setTab] = useState<"memberships" | "invitations">("memberships");
  const [selectedMembershipId, setSelectedMembershipId] = useState(directory.memberships[0]?.id ?? "");
  const [selectedInvitationIds, setSelectedInvitationIds] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [message, setMessage] = useState("");
  const selectedMembership = directory.memberships.find((membership) => membership.id === selectedMembershipId);
  const selectedInvitations = useMemo(() => directory.invitations.filter((invitation) => selectedInvitationIds.has(invitation.id)), [directory.invitations, selectedInvitationIds]);
  function done(value: string) { setMessage(value); setSelectedInvitationIds(new Set()); setBulkOpen(false); router.refresh(); }
  async function bulkRevoke(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { await mutate("invitations-bulk-revoke", { invitationIds: selectedInvitations.map((invitation) => invitation.id), reason: String(form.get("reason")) }); done(`${selectedInvitations.length} invitations revoked.`); } catch (error) { setMessage(error instanceof Error ? error.message : "Bulk revocation failed"); } }
  return <div className="access-workspace"><header className="access-heading"><div><p>IDENTITY & ACCESS</p><h1>Membership and invitation directory</h1><span>Manage verified identities, delegated roles and invitation evidence without trusting browser-supplied tenant context.</span></div><nav aria-label="Access directory views"><button className={tab === "memberships" ? "active" : ""} onClick={() => setTab("memberships")}>Memberships <b>{directory.memberships.length}</b></button><button className={tab === "invitations" ? "active" : ""} onClick={() => setTab("invitations")}>Invitations <b>{directory.invitations.length}</b></button></nav></header>{message ? <p className="access-notice" role="status">{message}</p> : null}<section className="access-overview"><article><span>Active memberships</span><strong>{directory.memberships.filter((item) => item.status === "active").length}</strong><small>Current page</small></article><article><span>Pending invitations</span><strong>{directory.invitations.length}</strong><small>Active tokens only</small></article><article><span>Role assignments</span><strong>{directory.memberships.reduce((count, item) => count + item.roles.length, 0)}</strong><small>Current and effective</small></article><article><span>Assurance</span><strong>MFA</strong><small>Required for changes</small></article></section>{tab === "memberships" ? <section className="access-layout"><div className="access-directory"><header><div><p>MEMBERSHIP REGISTER</p><h2>Verified identities</h2></div><span>{directory.memberships.length} shown</span></header>{directory.memberships.length ? <div className="access-table-wrap"><table><thead><tr><th>Identity</th><th>Status</th><th>Roles</th><th>Created</th></tr></thead><tbody>{directory.memberships.map((membership) => <tr key={membership.id} className={membership.id === selectedMembershipId ? "selected" : ""} onClick={() => setSelectedMembershipId(membership.id)}><td><strong>{membership.identity.displayName ?? "Verified identity"}</strong><small>{membership.identity.email ?? membership.userId}</small></td><td><span className={`access-status ${membership.status}`}>{human(membership.status)}</span></td><td>{membership.roles.length}</td><td>{date(membership.createdAt)}</td></tr>)}</tbody></table></div> : <p className="access-empty-copy">No memberships match this scope.</p>}</div>{selectedMembership ? <MembershipInspector membership={selectedMembership} tenantId={tenantId} institutions={institutions} canUseTenantScope={tenantOwner} canChangeStatus={tenantOwner} onDone={done} /> : null}</section> : <section className="access-invitation-grid"><div className="access-directory"><header><div><p>ACTIVE INVITATIONS</p><h2>Delivery and acceptance queue</h2></div><span>{directory.invitations.length} active</span></header><BulkSelectionToolbar selectedCount={selectedInvitationIds.size} totalVisible={directory.invitations.length} label="Invitation bulk actions" onClear={() => setSelectedInvitationIds(new Set())}><button type="button" onClick={() => setBulkOpen(true)}>Revoke selected</button></BulkSelectionToolbar>{bulkOpen ? <form className="access-bulk-confirmation" onSubmit={bulkRevoke}><strong>Revoke {selectedInvitationIds.size} active invitations</strong><p>The transaction fails without changing any invitation if one selected record is no longer active or no longer delegable.</p><textarea name="reason" required minLength={20} maxLength={500} rows={3} placeholder="Reason for revoking this invitation set" /><div><button type="button" className="secondary" onClick={() => setBulkOpen(false)}>Cancel</button><button>Confirm revocation</button></div></form> : null}{directory.invitations.length ? <div className="access-table-wrap"><table><thead><tr><th className="people-select-column"><span className="sr-only">Select</span></th><th>Email</th><th>Role and scope</th><th>Status</th><th>Expires</th><th>Actions</th></tr></thead><tbody>{directory.invitations.map((invitation) => <tr key={invitation.id}><td className="people-select-column"><input type="checkbox" checked={selectedInvitationIds.has(invitation.id)} onChange={() => setSelectedInvitationIds((current) => { const next = new Set(current); if (next.has(invitation.id)) next.delete(invitation.id); else next.add(invitation.id); return next; })} aria-label={`Select invitation for ${invitation.email}`} /></td><td><strong>{invitation.email}</strong><small>Created {date(invitation.createdAt)}</small></td><td><strong>{human(invitation.roleKey)}</strong><small>{invitation.scopeLabel ?? invitation.scopeId}</small></td><td><span className={`access-status ${invitation.status}`}>{human(invitation.status)}</span></td><td>{date(invitation.expiresAt)}</td><td><InvitationActions invitation={invitation} onDone={done} /></td></tr>)}</tbody></table></div> : <p className="access-empty-copy">No active invitations.</p>}</div><aside className="access-invite-panel"><header><p>NEW INVITATION</p><h2>Delegate scoped access</h2><span>The invited identity must verify the exact email address before acceptance.</span></header><InviteForm tenantId={tenantId} institutions={institutions} canUseTenantScope={tenantOwner} onDone={done} /></aside></section>}</div>;
}
