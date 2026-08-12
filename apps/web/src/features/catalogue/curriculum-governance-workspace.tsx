"use client";

import { useMemo } from "react";
import type {
  BaselineRoleKey,
  CatalogueReferences,
  CatalogueWorkspace,
} from "@veza/contracts";
import { Tabs } from "@veza/ui";
import { CurriculumGovernanceCurriculumView } from "./curriculum-governance-curriculum-view";
import { CurriculumGovernanceDeliveryView } from "./curriculum-governance-delivery-view";
import { CurriculumGovernanceEnrolmentView } from "./curriculum-governance-enrolment-view";

export function CurriculumGovernanceWorkspace({
  institutionId,
  workspace,
  references,
  roles,
}: {
  institutionId: string;
  workspace: CatalogueWorkspace;
  references: CatalogueReferences;
  roles: readonly BaselineRoleKey[];
}) {
  const canDeliveryManage = roles.some((role) =>
    ["tenant-owner", "institution-admin", "registrar", "course-manager"].includes(role),
  );
  const metrics = useMemo(
    () => ({
      approvedCurriculum:
        workspace.programmes.filter((item) => item.lifecycle === "approved").length +
        workspace.blueprints.filter((item) => item.lifecycle === "approved").length,
      reviewQueue:
        workspace.programmes.filter((item) => item.lifecycle === "in_review").length +
        workspace.blueprints.filter((item) => item.lifecycle === "in_review").length,
      activeRuns: workspace.runs.filter((run) =>
        ["open", "in_progress"].includes(run.lifecycle),
      ).length,
      activeEnrolments: workspace.enrolments.filter(
        (enrolment) => enrolment.status === "active",
      ).length,
    }),
    [workspace],
  );

  return (
    <div className="catalogue-workspace curriculum-governance-workspace">
      <header className="catalogue-heading">
        <div>
          <p>Academic operations</p>
          <h1>Catalogue, curriculum and enrolment</h1>
          <span>
            Versioned curriculum definitions, impact-reviewed approvals and effective-dated delivery evidence.
          </span>
        </div>
        <div className="catalogue-boundary">
          <small>Institution boundary</small>
          <strong>{institutionId.slice(0, 12)}...</strong>
        </div>
      </header>

      <section className="catalogue-metrics" aria-label="Academic operations summary">
        <article>
          <span>Approved curriculum</span>
          <strong>{metrics.approvedCurriculum}</strong>
          <small>Programmes and definitions</small>
        </article>
        <article>
          <span>Review queue</span>
          <strong>{metrics.reviewQueue}</strong>
          <small>Awaiting independent approval</small>
        </article>
        <article>
          <span>Active runs</span>
          <strong>{metrics.activeRuns}</strong>
          <small>Open or in progress</small>
        </article>
        <article>
          <span>Active enrolments</span>
          <strong>{metrics.activeEnrolments}</strong>
          <small>Current effective records</small>
        </article>
      </section>

      <Tabs
        label="Academic operations views"
        items={[
          {
            value: "curriculum",
            label: "Curriculum",
            panel: (
              <CurriculumGovernanceCurriculumView
                institutionId={institutionId}
                workspace={workspace}
                roles={roles}
              />
            ),
          },
          {
            value: "delivery",
            label: "Delivery",
            panel: (
              <CurriculumGovernanceDeliveryView
                institutionId={institutionId}
                workspace={workspace}
                references={references}
                canManage={canDeliveryManage}
              />
            ),
          },
          {
            value: "enrolments",
            label: "Enrolments",
            panel: (
              <CurriculumGovernanceEnrolmentView
                institutionId={institutionId}
                workspace={workspace}
                references={references}
                canManage={canDeliveryManage}
              />
            ),
          },
        ]}
      />
    </div>
  );
}
