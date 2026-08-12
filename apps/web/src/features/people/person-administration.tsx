"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type {
  PeopleOperationReferences,
  PersonDetail,
} from "@veza/contracts";
import { Button } from "@veza/ui";
import {
  requestJson,
  requireJsonObject,
} from "../../components/governed-operation";
import { PersonAdministrationEvidence } from "./person-administration-evidence";
import { PersonAdministrationIdentityActions } from "./person-administration-identity-actions";
import { PersonAdministrationRecordActions } from "./person-administration-record-actions";

export function PersonAdministration({
  person,
  institutionId,
  references,
  canManage,
}: {
  person: PersonDetail;
  institutionId?: string;
  references?: PeopleOperationReferences;
  canManage: boolean;
}) {
  const router = useRouter();
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  async function exportRecord() {
    if (!institutionId) return;
    setExporting(true);
    setExportMessage("");
    try {
      const result = requireJsonObject(
        await requestJson(
          `/api/people/${person.id}/operations/data-subject-requests`,
          "POST",
          {
            institutionId,
            requestType: "export",
            reason:
              "Institution administrator generated an authorised data-subject export for review and delivery.",
          },
          "Person export failed",
        ),
        "Person export returned an invalid response",
      );
      const snapshot = requireJsonObject(
        result.snapshot,
        "Export snapshot was not returned",
      );
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `veza-person-${person.id}.json`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      router.refresh();
    } catch (error) {
      setExportMessage(error instanceof Error ? error.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="person-administration">
      <header>
        <div>
          <p>Institution-controlled evidence</p>
          <h2>Identity, engagement and privacy record</h2>
          <span>
            Global identity remains separate from the institution-owned person record.
          </span>
        </div>
        {canManage && institutionId ? (
          <Button
            type="button"
            variant="secondary"
            onClick={exportRecord}
            loading={exporting}
            disabled={exporting}
          >
            Export person record
          </Button>
        ) : null}
      </header>

      {exportMessage ? (
        <p className="people-error" role="alert">
          {exportMessage}
        </p>
      ) : null}

      <PersonAdministrationEvidence
        person={person}
        references={references}
        institutionId={institutionId}
        canManage={canManage}
      />

      {canManage && institutionId && references ? (
        <aside className="person-admin-actions" aria-label="Person administration actions">
          <header>
            <p>Authoritative actions</p>
            <h3>Extend this person record</h3>
          </header>
          <PersonAdministrationRecordActions
            person={person}
            institutionId={institutionId}
            references={references}
          />
          <PersonAdministrationIdentityActions
            person={person}
            institutionId={institutionId}
            references={references}
          />
        </aside>
      ) : null}
    </section>
  );
}
