import { notFound } from "next/navigation";
import { AppShell } from "../../../src/components/app-shell";
import { PersonRecord } from "../../../src/features/people/person-record";
import { loadPerson } from "../../../src/server/people-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export default async function PersonPage({ params }: { params: Promise<{ personId: string }> }) {
  const [{ personId }, resolution] = await Promise.all([params, requireWorkspaceSession()]);
  if (!uuid.test(personId)) notFound();
  const person = await loadPerson(personId).catch(() => null); if (!person) notFound();
  return <AppShell session={resolution.session} active="people"><PersonRecord person={person} session={resolution.session}/></AppShell>;
}
