import type { BaselineRoleKey } from "@veza/contracts";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { PeopleWorkspace } from "../../src/features/people/people-workspace";
import { loadPeople, type PeopleFilters } from "../../src/server/people-api";
import { requireWorkspaceAccess } from "../../src/server/require-workspace-access";

export const dynamic = "force-dynamic";
type Query = Readonly<Record<string, string | string[] | undefined>>;
const roles: readonly BaselineRoleKey[] = [
  "tenant-owner",
  "institution-admin",
  "registrar",
  "course-manager",
  "instructor",
];

function single(value: string | string[] | undefined) {
  return typeof value === "string" && value.length ? value : undefined;
}

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Query>;
}) {
  const [resolution, query] = await Promise.all([
    requireWorkspaceAccess("/people"),
    searchParams,
  ]);
  const membershipRoles = new Set(resolution.session.membership.roles);
  if (!roles.some((role) => membershipRoles.has(role))) notFound();

  const search = single(query.search)?.slice(0, 120);
  const status = single(query.status);
  const cursor = single(query.cursor)?.slice(0, 512);
  const filters: PeopleFilters = {
    ...(search ? { search } : {}),
    ...(status ? { status } : {}),
    learnersOnly: single(query.learnersOnly) === "true",
    staffOnly: single(query.staffOnly) === "true",
    ...(cursor ? { cursor } : {}),
    limit: 30,
  };
  const page = await loadPeople(filters);
  const canReconcile = resolution.session.membership.roles.some((role) =>
    ["tenant-owner", "institution-admin", "registrar"].includes(role),
  );

  return (
    <AppShell session={resolution.session} active="people">
      {canReconcile ? (
        <nav className="people-secondary-navigation" aria-label="People administration">
          <Link href="/people/duplicates">Review duplicate candidates</Link>
          <Link href="/people/invitations/new">Invite workspace member</Link>
        </nav>
      ) : null}
      <PeopleWorkspace
        page={page}
        filters={filters}
        session={resolution.session}
      />
    </AppShell>
  );
}
