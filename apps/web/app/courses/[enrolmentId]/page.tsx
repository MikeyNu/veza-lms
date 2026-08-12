import { AppShell } from "../../../src/components/app-shell";
import { LearnerAssignmentPanel } from "../../../src/features/learner/learner-assignment-panel";
import { LearnerCourseWorkspace } from "../../../src/features/learner/learner-course-workspace";
import { LearnerUploadFinalization } from "../../../src/features/learner/learner-upload-finalization";
import {
  loadLearnerAssignments,
  loadLearnerCourseRoom,
  loadLearnerGradebook,
} from "../../../src/server/learning-platform-api";
import { requireWorkspaceAccess } from "../../../src/server/require-workspace-access";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
  searchParams,
}: {
  params: Promise<{ enrolmentId: string }>;
  searchParams: Promise<{ lowBandwidth?: string }>;
}) {
  const { enrolmentId } = await params;
  const query = await searchParams;
  const lowBandwidth = query.lowBandwidth === "true";
  const resolution = await requireWorkspaceAccess(`/courses/${enrolmentId}`);
  const [room, assignments] = await Promise.all([
    loadLearnerCourseRoom(enrolmentId, lowBandwidth),
    loadLearnerAssignments(),
  ]);
  const gradebook = await loadLearnerGradebook(room.courseRunId);
  return <AppShell session={resolution.session} active="learning">
    <LearnerCourseWorkspace room={room} lowBandwidth={lowBandwidth}/>
    <LearnerAssignmentPanel
      enrolmentId={enrolmentId}
      courseRunId={room.courseRunId}
      workspace={assignments}
      gradebook={gradebook}
    />
    <LearnerUploadFinalization enrolmentId={enrolmentId} workspace={assignments}/>
  </AppShell>;
}
