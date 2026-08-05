import { notFound } from "next/navigation";
import { AppShell } from "../../../../src/components/app-shell";
import { StudioLessonEditorComplete } from "../../../../src/features/studio/studio-complete-workspaces";
import {
  loadStudioLesson,
  loadStudioLibrary,
  loadStudioWorkspace,
} from "../../../../src/server/learning-platform-api";
import { requireWorkspaceSession } from "../../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function StudioLessonPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const resolution = await requireWorkspaceSession();
  const allowed = [
    "tenant-owner",
    "institution-admin",
    "curriculum-manager",
    "course-manager",
    "instructor",
  ];
  if (!resolution.session.membership.roles.some((role) => allowed.includes(role))) notFound();
  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const { lessonId } = await params;
  const [detail, library, workspace] = await Promise.all([
    loadStudioLesson(institutionId, lessonId),
    loadStudioLibrary(institutionId),
    loadStudioWorkspace(institutionId),
  ]);
  const space = workspace.spaces.find((item) => item.id === detail.courseSpaceId);
  if (!space) notFound();
  return (
    <AppShell session={resolution.session} active="studio">
      <StudioLessonEditorComplete
        institutionId={institutionId}
        detail={detail}
        library={library}
        space={space}
      />
    </AppShell>
  );
}
