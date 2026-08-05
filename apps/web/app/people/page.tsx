import { notFound } from "next/navigation";
import type { BaselineRoleKey } from "@veza/contracts";
import { AppShell } from "../../src/components/app-shell";
import { PeopleWorkspace } from "../../src/features/people/people-workspace";
import { loadPeople, type PeopleFilters } from "../../src/server/people-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";
type Query = Readonly<Record<string, string | string[] | undefined>>;
const roles: readonly BaselineRoleKey[] = ["tenant-owner", "institution-admin", "registrar", "course-manager", "instructor"];
function single(value: string | string[] | undefined) { return typeof value === "string" && value.length ? value : undefined; }

export default async function PeoplePage({ searchParams }: { searchParams: Promise<Query> }) {
  const [resolution, query] = await Promise.all([requireWorkspaceSession(), searchParams]);
  const membershipRoles = new Set(resolution.session.membership.roles);
  if (!roles.some((role) => membershipRoles.has(role))) notFound();
  const filters: PeopleFilters = { search: single(query.search)?.slice(0, 120), status: single(query.status), learnersOnly: single(query.learnersOnly) === "true", staffOnly: single(query.staffOnly) === "true", cursor: single(query.cursor)?.slice(0, 512), limit: 30 };
  const page = await loadPeople(filters);
  return <AppShell session={resolution.session} active="people"><PeopleWorkspace page={page} filters={filters} session={resolution.session}/></AppShell>;
}
