"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type {
  CourseBlueprintSummary,
  CurriculumAnalysis,
  CurriculumHistory,
  CurriculumValidationIssue,
  ProgrammeVersionSummary,
} from "@veza/contracts";
import { Button, DateInput, Field, StatusIndicator, Textarea } from "@veza/ui";
import { requestJson, requireJsonObject } from "../../components/governed-operation";

type CurriculumKind = "programmes" | "blueprints";
type CurriculumItem = ProgrammeVersionSummary | CourseBlueprintSummary;

type ReviewState = Readonly<{
  analysis?: CurriculumAnalysis;
  history?: CurriculumHistory;
  error?: string;
  loading?: boolean;
}>;

function label(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ");
}

function formatDate(value?: string): string {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
    timeZone: "Africa/Johannesburg",
  }).format(new Date(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseIssue(value: unknown): CurriculumValidationIssue {
  const issue = requireJsonObject(value, "Curriculum analysis contained an invalid finding");
  if (
    typeof issue.code !== "string" ||
    (issue.severity !== "error" && issue.severity !== "warning") ||
    typeof issue.message !== "string" ||
    (issue.field !== undefined && typeof issue.field !== "string")
  ) {
    throw new Error("Curriculum analysis contained an invalid finding");
  }
  return {
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    ...(typeof issue.field === "string" ? { field: issue.field } : {}),
    ...(issue.actual !== undefined ? { actual: issue.actual } : {}),
    ...(issue.expected !== undefined ? { expected: issue.expected } : {}),
  };
}

function parseValidation(value: unknown): CurriculumAnalysis["validation"] {
  const validation = requireJsonObject(value, "Curriculum analysis returned invalid validation data");
  if (
    typeof validation.passed !== "boolean" ||
    !Array.isArray(validation.errors) ||
    !Array.isArray(validation.warnings) ||
    (validation.policyVersionId !== undefined && typeof validation.policyVersionId !== "string")
  ) {
    throw new Error("Curriculum analysis returned invalid validation data");
  }
  return {
    passed: validation.passed,
    errors: validation.errors.map(parseIssue),
    warnings: validation.warnings.map(parseIssue),
    ...(typeof validation.policyVersionId === "string"
      ? { policyVersionId: validation.policyVersionId }
      : {}),
  };
}

function parseAnalysis(value: unknown): CurriculumAnalysis {
  const analysis = requireJsonObject(value, "Curriculum analysis returned an invalid response");
  if (
    typeof analysis.reviewId !== "string" ||
    (analysis.resourceType !== "programme-version" &&
      analysis.resourceType !== "course-blueprint-version") ||
    typeof analysis.resourceId !== "string" ||
    typeof analysis.resourceVersion !== "number" ||
    !isRecord(analysis.outcomeCoverage) ||
    !isRecord(analysis.impact)
  ) {
    throw new Error("Curriculum analysis returned an invalid response");
  }
  return {
    reviewId: analysis.reviewId,
    resourceType: analysis.resourceType,
    resourceId: analysis.resourceId,
    resourceVersion: analysis.resourceVersion,
    validation: parseValidation(analysis.validation),
    outcomeCoverage: analysis.outcomeCoverage,
    impact: analysis.impact,
  };
}

function parseHistory(value: unknown): CurriculumHistory {
  const history = requireJsonObject(value, "Curriculum history returned an invalid response");
  if (
    (history.resourceType !== "programme-version" &&
      history.resourceType !== "course-blueprint-version") ||
    typeof history.aggregateId !== "string" ||
    !Array.isArray(history.versions) ||
    !Array.isArray(history.reviews) ||
    !Array.isArray(history.auditEvents) ||
    !history.versions.every(isRecord) ||
    !history.reviews.every(isRecord) ||
    !history.auditEvents.every(isRecord)
  ) {
    throw new Error("Curriculum history returned an invalid response");
  }
  return {
    resourceType: history.resourceType,
    aggregateId: history.aggregateId,
    versions: history.versions,
    reviews: history.reviews,
    auditEvents: history.auditEvents,
  };
}

function ReviewEvidence({
  analysis,
  history,
}: {
  analysis?: CurriculumAnalysis;
  history?: CurriculumHistory;
}) {
  if (!analysis && !history) return null;
  return (
    <div className="curriculum-review-drawer">
      {analysis ? (
        <>
          <header>
            <div>
              <small>Impact review</small>
              <strong>
                {analysis.validation.passed
                  ? "No blocking validation findings"
                  : `${analysis.validation.errors.length} blocking findings`}
              </strong>
            </div>
            <StatusIndicator
              label={analysis.validation.passed ? "Pass" : "Blocked"}
              tone={analysis.validation.passed ? "success" : "danger"}
            />
          </header>
          <dl className="curriculum-review-metrics">
            <div>
              <dt>Review ID</dt>
              <dd><code>{analysis.reviewId.slice(0, 12)}...</code></dd>
            </div>
            <div>
              <dt>Warnings</dt>
              <dd>{analysis.validation.warnings.length}</dd>
            </div>
            <div>
              <dt>Version checked</dt>
              <dd>{analysis.resourceVersion}</dd>
            </div>
          </dl>
          {analysis.validation.errors.length || analysis.validation.warnings.length ? (
            <ul className="curriculum-review-findings">
              {[...analysis.validation.errors, ...analysis.validation.warnings].map((issue) => (
                <li key={`${issue.severity}-${issue.code}-${issue.field ?? "general"}`}>
                  <StatusIndicator
                    label={issue.severity === "error" ? "Error" : "Warning"}
                    tone={issue.severity === "error" ? "danger" : "warning"}
                  />
                  <div>
                    <strong>{issue.message}</strong>
                    <small>{issue.code}{issue.field ? ` · ${issue.field}` : ""}</small>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <details className="curriculum-review-json">
            <summary>Outcome coverage and dependency impact</summary>
            <pre>{JSON.stringify({ outcomeCoverage: analysis.outcomeCoverage, impact: analysis.impact }, null, 2)}</pre>
          </details>
        </>
      ) : null}
      {history ? (
        <details className="curriculum-history" open={!analysis}>
          <summary>
            Historical reconstruction · {history.versions.length} versions · {history.reviews.length} reviews
          </summary>
          <div>
            {history.versions.map((version, index) => (
              <article key={String(version.id ?? index)}>
                <strong>
                  Version {String(version.version_number ?? "?")} · {label(String(version.lifecycle ?? "unknown"))}
                </strong>
                <span>
                  {formatDate(typeof version.effective_from === "string" ? version.effective_from : undefined)}
                </span>
                <small>
                  {typeof version.approval_review_id === "string"
                    ? `Review ${version.approval_review_id.slice(0, 12)}...`
                    : "No approval review"}
                </small>
              </article>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

export function CurriculumLifecycle({
  institutionId,
  kind,
  item,
  canSubmit,
  canApprove,
}: {
  institutionId: string;
  kind: CurriculumKind;
  item: CurriculumItem;
  canSubmit: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [review, setReview] = useState<ReviewState>({});
  const [saving, setSaving] = useState(false);
  const basePath = `/api/catalogue/curriculum/${kind}/${item.id}`;

  async function analyse(): Promise<CurriculumAnalysis> {
    const result = parseAnalysis(
      await requestJson(`${basePath}/analysis`, "POST", { institutionId }, "Curriculum analysis failed"),
    );
    setReview((current) => ({ ...current, loading: false, analysis: result, error: undefined }));
    return result;
  }

  async function runAnalysis() {
    setReview((current) => ({ ...current, loading: true, error: undefined }));
    try {
      await analyse();
    } catch (error) {
      setReview((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "Analysis failed",
      }));
    }
  }

  async function loadHistory() {
    setReview((current) => ({ ...current, loading: true, error: undefined }));
    try {
      const result = parseHistory(
        await requestJson(
          `${basePath}/history?institutionId=${encodeURIComponent(institutionId)}`,
          "GET",
          undefined,
          "Curriculum history failed",
        ),
      );
      setReview((current) => ({ ...current, loading: false, history: result }));
    } catch (error) {
      setReview((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "History failed",
      }));
    }
  }

  async function submitReview() {
    setSaving(true);
    setReview((current) => ({ ...current, error: undefined }));
    try {
      await requestJson(
        `${basePath}/submit`,
        "POST",
        { institutionId, expectedVersion: item.version },
        "Curriculum review submission failed",
      );
      await analyse();
      router.refresh();
    } catch (error) {
      setReview((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Submission failed",
      }));
    } finally {
      setSaving(false);
    }
  }

  async function approve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const element = event.currentTarget;
    const form = new FormData(element);
    setSaving(true);
    setReview((current) => ({ ...current, error: undefined }));
    try {
      const currentReview =
        review.analysis?.resourceVersion === item.version ? review.analysis : await analyse();
      if (!currentReview.validation.passed) {
        throw new Error("Approval is blocked by the current curriculum review");
      }
      await requestJson(
        `${basePath}/approve`,
        "POST",
        {
          institutionId,
          expectedVersion: item.version,
          approvalReviewId: currentReview.reviewId,
          effectiveFrom: form.get("effectiveFrom"),
          effectiveUntil: form.get("effectiveUntil") || undefined,
          approvalNotes: form.get("approvalNotes"),
        },
        "Curriculum approval failed",
      );
      element.reset();
      router.refresh();
    } catch (error) {
      setReview((current) => ({
        ...current,
        error: error instanceof Error ? error.message : "Approval failed",
      }));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="curriculum-lifecycle">
      <div className="curriculum-lifecycle-actions">
        <Button type="button" variant="secondary" size="small" onClick={runAnalysis} disabled={review.loading || saving}>
          {review.loading ? "Reviewing" : "Run impact review"}
        </Button>
        <Button type="button" variant="quiet" size="small" onClick={loadHistory} disabled={review.loading || saving}>
          Version history
        </Button>
        {item.lifecycle === "draft" && canSubmit ? (
          <Button type="button" size="small" onClick={submitReview} loading={saving} disabled={saving}>
            Submit for review
          </Button>
        ) : null}
      </div>
      {item.lifecycle === "in_review" && canApprove ? (
        <details className="curriculum-approval-form">
          <summary>Approve reviewed version</summary>
          <form onSubmit={approve} className="vz-field-list">
            <Field label="Effective from"><DateInput name="effectiveFrom" required /></Field>
            <Field label="Effective until"><DateInput name="effectiveUntil" /></Field>
            <Field label="Approval notes">
              <Textarea name="approvalNotes" minLength={20} maxLength={1000} required />
            </Field>
            <Button type="submit" loading={saving} disabled={saving}>Approve with current review</Button>
          </form>
        </details>
      ) : null}
      {review.error ? <p className="catalogue-error" role="alert">{review.error}</p> : null}
      <ReviewEvidence
        {...(review.analysis ? { analysis: review.analysis } : {})}
        {...(review.history ? { history: review.history } : {})}
      />
    </div>
  );
}
