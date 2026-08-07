import { notFound } from "next/navigation";
import { AppShell } from "../../../src/components/app-shell";
import { PersonAdministration } from "../../../src/features/people/person-administration";
import { PersonRecord } from "../../../src/features/people/person-record";
import { loadPerson } from "../../../src/server/people-api";
import { loadPeopleReferences } from "../../../src/server/people-reference-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const managingRoles = new Set(["tenant-owner", "institution-admin", "registrar"]);

export default async function PersonPage({
  params,
}: {
  params: Promise<{ personId: string }>;
}) {
  const [{ personId }, resolution] = await Promise.all([
    params,
    requireWorkspaceSession(),
  ]);
  if (!uuid.test(personId)) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  const canManage = resolution.session.membership.roles.some((role) =>
    managingRoles.has(role),
  );
  const [person, references] = await Promise.all([
    loadPerson(personId).catch(() => null),
    canManage && institutionId
      ? loadPeopleReferences(institutionId).catch(() => undefined)
      : Promise.resolve(undefined),
  ]);
  if (!person) notFound();
  return (
    <AppShell session={resolution.session} active="people">
      <PersonRecord person={person} session={resolution.session} />
      <PersonAdministration
        person={person}
        canManage={canManage}
        {...(institutionId ? { institutionId } : {})}
        {...(references ? { references } : {})}
      />
    </AppShell>
  );
}
