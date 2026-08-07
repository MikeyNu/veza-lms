import { notFound } from "next/navigation";
import { AppShell } from "../../src/components/app-shell";
import { AnalyticsReferenceWorkspace } from "../../src/features/analytics/analytics-reference-workspace";
import { LearnerProgressWorkspace } from "../../src/features/learner/learner-progress-workspace";
import { primaryRole } from "../../src/features/workspace/navigation";
import { loadInstitutionAnalytics } from "../../src/server/academic-evidence-api";
import { loadLearnerToday } from "../../src/server/learning-platform-api";
import { requireWorkspaceSession } from "../../src/server/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function InsightsPage() {
  const resolution = await requireWorkspaceSession();
  const role = primaryRole(resolution.session);

  if (role === "learner") {
    const home = await loadLearnerToday();
    return (
      <AppShell session={resolution.session} active="insights">
        <LearnerProgressWorkspace home={home} />
      </AppShell>
    );
  }

  if (role === "guardian-sponsor") {
    return (
      <AppShell session={resolution.session} active="insights">
        <section className="workspace section-state" aria-labelledby="guardian-summary-title">
          <div className="section-state-panel">
            <p className="eyebrow">LEARNER SUMMARY</p>
            <h1 id="guardian-summary-title">No learner relationship is available</h1>
            <p>A learner summary appears only after the institution records an active relationship and the disclosure policy allows progress information to be shared.</p>
            <div className="section-state-evidence">
              <span aria-hidden="true">i</span>
              <div>
                <strong>Privacy boundary preserved</strong>
                <small>No learner identity, course progress or assessment result is disclosed without an authorised relationship.</small>
              </div>
            </div>
          </div>
        </section>
      </AppShell>
    );
  }

  const allowed = [
    "tenant-owner",
    "institution-admin",
    "registrar",
    "course-manager",
    "instructor",
    "auditor",
  ];
  if (!resolution.session.membership.roles.some((candidate) => allowed.includes(candidate))) notFound();

  const institutionId = resolution.session.membership.institutionIds[0];
  if (!institutionId) notFound();
  const metrics = await loadInstitutionAnalytics(institutionId);

  return (
    <AppShell session={resolution.session} active="insights">
      <AnalyticsReferenceWorkspace metrics={metrics} />
    </AppShell>
  );
}