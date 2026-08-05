import { AppShell } from "../../../src/components/app-shell";
import { DuplicateReview } from "../../../src/features/people/duplicate-review";
import { loadDuplicateCandidates } from "../../../src/server/people-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic="force-dynamic";
export default async function DuplicatePage({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){const [resolution,query]=await Promise.all([requireWorkspaceSession(),searchParams]);const cursor=typeof query.cursor==="string"?query.cursor.slice(0,512):undefined;const page=await loadDuplicateCandidates(cursor);return <AppShell session={resolution.session} active="people"><DuplicateReview page={page}/></AppShell>;}
