import { notFound } from "next/navigation";
import { AppShell } from "../../../src/components/app-shell";
import { StaffGradebookWorkspace } from "../../../src/features/academic-evidence/staff-gradebook-workspace";
import { loadStaffGradebook } from "../../../src/server/academic-evidence-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function StaffGradebookPage({
  params,
}: {
  params: Promise<{ courseRunId: string }>;
}) {
  const resolution = await requireWorkspaceSession();
  const allowed = [
    "tenant-owner",
    "institution-admin",
    "registrar",
    "course-manager",
    "instructor",
    "assessor",
    "moderator",
    "auditor",
  ];
  if (!resolution.session.membership.roles.some((role) => allowed.includes(role))) notFound();
  const { courseRunId } = await params;
  const gradebook = await loadStaffGradebook(courseRunId);
  return (
    <AppShell session={resolution.session} active="assessments">
      <StaffGradebookWorkspace gradebook={gradebook} />
    </AppShell>
  );
}
