import { notFound } from "next/navigation";
import { AppShell } from "../../../src/components/app-shell";
import { LearnerCourseWorkspace } from "../../../src/features/learner/learner-workspaces";
import { loadLearnerCourseRoom } from "../../../src/server/learning-platform-api";
import { requireWorkspaceSession } from "../../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function CourseRoomPage({ params, searchParams }: { params: Promise<{ enrolmentId: string }>; searchParams: Promise<{ lowBandwidth?: string }> }) {
  const resolution = await requireWorkspaceSession();
  if (!resolution.session.membership.roles.includes("learner")) notFound();
  const { enrolmentId } = await params;
  const query = await searchParams;
  const lowBandwidth = query.lowBandwidth === "true";
  const room = await loadLearnerCourseRoom(enrolmentId, lowBandwidth);
  return <AppShell session={resolution.session} active="learning"><LearnerCourseWorkspace room={room} initialLowBandwidth={lowBandwidth} /></AppShell>;
}
