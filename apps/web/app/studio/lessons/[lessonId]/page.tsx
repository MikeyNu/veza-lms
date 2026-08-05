import { notFound } from "next/navigation";
import { AppShell } from "../../../../src/components/app-shell";
import { StudioLessonEditor } from "../../../../src/features/studio/studio-workspaces";
import { loadStudioLesson } from "../../../../src/server/learning-platform-api";
import { requireWorkspaceSession } from "../../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function StudioLessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const resolution = await requireWorkspaceSession();
  const allowed = ["tenant-owner", "institution-admin", "curriculum-manager", "course-manager", "instructor"];
  if (!resolution.session.membership.roles.some((role) => allowed.includes(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const { lessonId } = await params;
  const detail = await loadStudioLesson(institutionId, lessonId);
  return <AppShell session={resolution.session} active="studio"><StudioLessonEditor institutionId={institutionId} detail={detail} /></AppShell>;
}
