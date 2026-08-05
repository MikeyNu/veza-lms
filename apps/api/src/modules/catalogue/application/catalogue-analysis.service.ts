import { randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type {
  AddProgrammeOutcomeRequirementDto,
  ApproveCurriculumValidationPolicyDto,
  CreateCurriculumValidationPolicyDto,
  SubmitCurriculumReviewDto,
} from "./catalogue-analysis.dto.js";

type CurriculumResourceType = "programme-version" | "course-blueprint-version";

interface VersionRow extends QueryResultRow {
  id: string;
  institution_id: string;
  lifecycle: string;
  version: number;
  created_by: string;
  submitted_by: string | null;
}

interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  field?: string;
  message: string;
  actual?: unknown;
  expected?: unknown;
}

interface AnalysisResult {
  resourceType: CurriculumResourceType;
  resourceId: string;
  resourceVersion: number;
  validation: {
    passed: boolean;
    errors: readonly ValidationIssue[];
    warnings: readonly ValidationIssue[];
    policyVersionId?: string;
  };
  outcomeCoverage: Record<string, unknown>;
  impact: Record<string, unknown>;
}

const coverageRank: Readonly<Record<string, number>> = {
  introduced: 1,
  developed: 2,
  mastered: 3,
  assessed: 4,
};

@Injectable()
export class CatalogueAnalysisService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async preview(
    institutionId: string,
    resourceType: CurriculumResourceType,
    resourceId: string,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const analysis = await this.analyseWithin(client, institutionId, resourceType, resourceId);
      const reviewId = await this.persistReview(client, institutionId, analysis);
      return { reviewId, ...analysis };
    });
  }

  async submit(
    institutionId: string,
    resourceType: CurriculumResourceType,
    resourceId: string,
    input: SubmitCurriculumReviewDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const table = this.table(resourceType);
      const currentResult = await client.query<VersionRow>(
        `SELECT id,institution_id,lifecycle,version,created_by,submitted_by
         FROM ${table}
         WHERE id=$1 AND institution_id=$2
         FOR UPDATE`,
        [resourceId, institutionId],
      );
      const current = currentResult.rows[0];
      if (!current) throw new NotFoundException("Curriculum version was not found");
      if (current.lifecycle !== "draft" || current.version !== input.expectedVersion) {
        throw new ConflictException("Curriculum version changed or is no longer a draft");
      }
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE ${table}
         SET lifecycle='in_review',submitted_by=$4,submitted_at=now(),updated_by=$4,
             updated_at=now(),version=version+1
         WHERE id=$1 AND institution_id=$2 AND version=$3
         RETURNING version`,
        [resourceId, institutionId, input.expectedVersion, context.actorId],
      );
      const analysis = await this.analyseWithin(client, institutionId, resourceType, resourceId);
      if (!analysis.validation.passed) {
        throw new ConflictException({
          message: "Curriculum validation failed",
          errors: analysis.validation.errors,
        });
      }
      const reviewId = await this.persistReview(client, institutionId, analysis);
      await this.record(client, "catalogue.curriculum.submitted-for-review", resourceType, resourceId, {
        institutionId,
        reviewId,
        version: updated.rows[0].version,
      });
      return {
        id: resourceId,
        lifecycle: "in_review",
        reviewId,
        version: updated.rows[0].version,
        validation: analysis.validation,
      };
    });
  }

  async addProgrammeOutcomeRequirement(
    institutionId: string,
    programmeVersionId: string,
    input: AddProgrammeOutcomeRequirementDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const programmeResult = await client.query<VersionRow>(
        `SELECT id,institution_id,lifecycle,version,created_by,submitted_by
         FROM programme_versions
         WHERE id=$1 AND institution_id=$2
         FOR UPDATE`,
        [programmeVersionId, institutionId],
      );
      const programme = programmeResult.rows[0];
      if (!programme) throw new NotFoundException("Programme version was not found");
      if (!["draft", "in_review"].includes(programme.lifecycle)) {
        throw new ConflictException("Approved programme outcome requirements are immutable");
      }
      if (programme.version !== input.expectedProgrammeVersion) {
        throw new ConflictException("Programme version changed since it was loaded");
      }
      const outcome = await client.query(
        `SELECT id FROM learning_outcomes
         WHERE id=$1 AND institution_id=$2 AND status='active'`,
        [input.learningOutcomeId, institutionId],
      );
      if (!outcome.rowCount) throw new NotFoundException("Active learning outcome was not found");
      await client.query(
        `INSERT INTO programme_outcome_requirements (
           tenant_id,programme_version_id,learning_outcome_id,minimum_coverage_level
         ) VALUES ($1,$2,$3,$4)
         ON CONFLICT (tenant_id,programme_version_id,learning_outcome_id)
         DO UPDATE SET minimum_coverage_level=EXCLUDED.minimum_coverage_level`,
        [context.tenantId, programmeVersionId, input.learningOutcomeId, input.minimumCoverageLevel],
      );
      const version = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE programme_versions
         SET version=version+1,updated_by=$2,updated_at=now()
         WHERE id=$1 RETURNING version`,
        [programmeVersionId, context.actorId],
      );
      await this.markReviewsStale(client, "programme-version", programmeVersionId);
      await this.record(client, "catalogue.programme.outcome-required", "programme-version", programmeVersionId, {
        learningOutcomeId: input.learningOutcomeId,
        minimumCoverageLevel: input.minimumCoverageLevel,
        version: version.rows[0].version,
      });
      return { id: programmeVersionId, version: version.rows[0].version };
    });
  }

  async createValidationPolicy(
    institutionId: string,
    input: CreateCurriculumValidationPolicyDto,
  ) {
    this.validatePolicy(input);
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`curriculum-policy:${institutionId}`],
      );
      const next = await client.query<{ version_number: number } & QueryResultRow>(
        `SELECT COALESCE(max(version_number),0)+1 version_number
         FROM curriculum_validation_policies WHERE institution_id=$1`,
        [institutionId],
      );
      const versionNumber = Number(next.rows[0]?.version_number ?? 1);
      await client.query(
        `INSERT INTO curriculum_validation_policies (
           id,tenant_id,institution_id,version_number,lifecycle,credit_required,
           notional_hours_required,duration_required,hours_per_credit,
           ratio_tolerance_percent,minimum_credit,maximum_credit,
           minimum_notional_hours,maximum_notional_hours,created_by
         ) VALUES ($1,$2,$3,$4,'draft',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          id,
          context.tenantId,
          institutionId,
          versionNumber,
          input.creditRequired,
          input.notionalHoursRequired,
          input.durationRequired,
          input.hoursPerCredit ?? null,
          input.ratioTolerancePercent,
          input.minimumCredit ?? null,
          input.maximumCredit ?? null,
          input.minimumNotionalHours ?? null,
          input.maximumNotionalHours ?? null,
          context.actorId,
        ],
      );
      await this.record(client, "catalogue.validation-policy.created", "curriculum-validation-policy", id, {
        institutionId,
        versionNumber,
        version: 1,
      });
      return { id, versionNumber, lifecycle: "draft", version: 1 };
    });
  }

  async approveValidationPolicy(
    institutionId: string,
    policyId: string,
    input: ApproveCurriculumValidationPolicyDto,
  ) {
    if (input.effectiveUntil && input.effectiveUntil <= input.effectiveFrom) {
      throw new BadRequestException("Policy effective-until must be later than effective-from");
    }
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [`curriculum-policy-approval:${institutionId}`],
      );
      const result = await client.query<{
        id: string;
        lifecycle: string;
        created_by: string;
      } & QueryResultRow>(
        `SELECT id,lifecycle,created_by FROM curriculum_validation_policies
         WHERE id=$1 AND institution_id=$2 FOR UPDATE`,
        [policyId, institutionId],
      );
      const policy = result.rows[0];
      if (!policy) throw new NotFoundException("Curriculum validation policy was not found");
      if (policy.lifecycle !== "draft") throw new ConflictException("Only draft policies can be approved");
      if (policy.created_by === context.actorId) {
        throw new ConflictException("Validation policy approval requires an independent reviewer");
      }
      const previous = await client.query<{ id: string; effective_from: string } & QueryResultRow>(
        `SELECT id,effective_from FROM curriculum_validation_policies
         WHERE institution_id=$1 AND lifecycle='approved' AND effective_until IS NULL
         FOR UPDATE`,
        [institutionId],
      );
      if (previous.rows[0]) {
        if (previous.rows[0].effective_from >= input.effectiveFrom) {
          throw new ConflictException("Replacement policy must take effect after the current policy");
        }
        await client.query(
          "UPDATE curriculum_validation_policies SET effective_until=$2 WHERE id=$1",
          [previous.rows[0].id, input.effectiveFrom],
        );
      }
      await client.query(
        `UPDATE curriculum_validation_policies
         SET lifecycle='approved',effective_from=$3,effective_until=$4,
             approved_by=$5,approved_at=now()
         WHERE id=$1 AND institution_id=$2`,
        [policyId, institutionId, input.effectiveFrom, input.effectiveUntil ?? null, context.actorId],
      );
      await this.record(client, "catalogue.validation-policy.approved", "curriculum-validation-policy", policyId, {
        institutionId,
        effectiveFrom: input.effectiveFrom,
        effectiveUntil: input.effectiveUntil,
        reason: input.reason.trim(),
        version: 1,
      });
      return { id: policyId, lifecycle: "approved" };
    });
  }

  async history(
    institutionId: string,
    resourceType: CurriculumResourceType,
    resourceId: string,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const table = this.table(resourceType);
      const aggregateColumn = resourceType === "programme-version" ? "programme_id" : "course_definition_id";
      const current = await client.query(
        `SELECT ${aggregateColumn} aggregate_id FROM ${table}
         WHERE id=$1 AND institution_id=$2`,
        [resourceId, institutionId],
      );
      if (!current.rows[0]) throw new NotFoundException("Curriculum version was not found");
      const versions = await client.query(
        `SELECT id,version_number,lifecycle,title,credit_value,notional_hours,
                effective_from,effective_until,created_by,created_at,submitted_by,submitted_at,
                approved_by,approved_at,approval_review_id,approval_notes,version
         FROM ${table}
         WHERE ${aggregateColumn}=$1
         ORDER BY version_number DESC`,
        [current.rows[0].aggregate_id],
      );
      const ids = versions.rows.map((row) => row.id);
      const [reviews, audit] = await Promise.all([
        client.query(
          `SELECT id,resource_id,resource_version,compared_to_resource_id,status,
                  impact_snapshot,validation_snapshot,outcome_coverage_snapshot,
                  generated_by,generated_at,consumed_by,consumed_at
           FROM curriculum_change_reviews
           WHERE resource_type=$1 AND resource_id=ANY($2::uuid[])
           ORDER BY generated_at DESC`,
          [resourceType, ids],
        ),
        client.query(
          `SELECT id,event_type,actor_id,resource_id,before_state,after_state,occurred_at
           FROM audit_events
           WHERE resource_id=ANY($1::uuid[])
           ORDER BY occurred_at DESC
           LIMIT 500`,
          [ids],
        ),
      ]);
      return {
        resourceType,
        aggregateId: current.rows[0].aggregate_id,
        versions: versions.rows,
        reviews: reviews.rows,
        auditEvents: audit.rows,
      };
    });
  }

  private async analyseWithin(
    client: PoolClient,
    institutionId: string,
    resourceType: CurriculumResourceType,
    resourceId: string,
  ): Promise<AnalysisResult> {
    return resourceType === "programme-version"
      ? this.analyseProgramme(client, institutionId, resourceId)
      : this.analyseBlueprint(client, institutionId, resourceId);
  }

  private async analyseBlueprint(
    client: PoolClient,
    institutionId: string,
    resourceId: string,
  ): Promise<AnalysisResult> {
    const result = await client.query(
      `SELECT version.*,definition.code,definition.definition_type,
              definition.course_definition_id
       FROM (
         SELECT blueprint.*,blueprint.course_definition_id course_definition_id_alias
         FROM course_blueprint_versions blueprint
       ) version
       JOIN LATERAL (
         SELECT definition.code,definition.definition_type,
                definition.id course_definition_id
         FROM course_definitions definition
         WHERE definition.id=version.course_definition_id_alias
       ) definition ON true
       WHERE version.id=$1 AND version.institution_id=$2`,
      [resourceId, institutionId],
    );
    const blueprint = result.rows[0];
    if (!blueprint) throw new NotFoundException("Course blueprint version was not found");
    const policy = await this.currentPolicy(client, institutionId);
    const issues = this.validateCreditsAndDuration(blueprint, policy, false);
    const mappings = await client.query(
      `SELECT mapping.learning_outcome_id,mapping.coverage_level,outcome.code,outcome.title,
              outcome.outcome_type
       FROM blueprint_outcome_mappings mapping
       JOIN learning_outcomes outcome ON outcome.id=mapping.learning_outcome_id
       WHERE mapping.course_blueprint_version_id=$1
       ORDER BY outcome.code`,
      [resourceId],
    );
    if (mappings.rowCount === 0) {
      issues.push({
        code: "outcome-coverage-empty",
        severity: "error",
        field: "outcomes",
        message: "A course blueprint must map at least one active learning outcome.",
      });
    }
    if (!Array.isArray(blueprint.delivery_modes) || blueprint.delivery_modes.length === 0) {
      issues.push({
        code: "delivery-mode-empty",
        severity: "error",
        field: "deliveryModes",
        message: "A course blueprint must permit at least one delivery mode.",
      });
    }
    const previous = await client.query(
      `SELECT id,title,credit_value,notional_hours,delivery_modes,version_number
       FROM course_blueprint_versions
       WHERE course_definition_id=$1 AND lifecycle='approved' AND id <> $2
       ORDER BY version_number DESC LIMIT 1`,
      [blueprint.course_definition_id_alias, resourceId],
    );
    const previousId = previous.rows[0]?.id as string | undefined;
    const previousOutcomes = previousId
      ? await client.query(
          "SELECT learning_outcome_id,coverage_level FROM blueprint_outcome_mappings WHERE course_blueprint_version_id=$1",
          [previousId],
        )
      : { rows: [] };
    const dependencies = previousId
      ? await client.query<{ runs: string; enrolments: string } & QueryResultRow>(
          `SELECT count(DISTINCT run.id)::text runs,
                  count(DISTINCT enrolment.id)::text enrolments
           FROM course_runs run
           LEFT JOIN enrolments enrolment ON enrolment.course_run_id=run.id
           WHERE run.course_blueprint_version_id=$1`,
          [previousId],
        )
      : undefined;
    const currentOutcomeMap = new Map(
      mappings.rows.map((row) => [row.learning_outcome_id, row.coverage_level]),
    );
    const previousOutcomeMap = new Map(
      previousOutcomes.rows.map((row) => [row.learning_outcome_id, row.coverage_level]),
    );
    return this.buildAnalysis(
      "course-blueprint-version",
      resourceId,
      blueprint.version,
      policy,
      issues,
      {
        totalMapped: mappings.rowCount,
        byLevel: Object.fromEntries(
          Object.keys(coverageRank).map((level) => [
            level,
            mappings.rows.filter((row) => row.coverage_level === level).length,
          ]),
        ),
        outcomes: mappings.rows,
      },
      {
        comparedToResourceId: previousId,
        changedFields: previous.rows[0]
          ? ["title", "credit_value", "notional_hours", "delivery_modes"].filter(
              (field) => JSON.stringify(previous.rows[0][field]) !== JSON.stringify(blueprint[field]),
            )
          : [],
        outcomesAdded: [...currentOutcomeMap.keys()].filter((id) => !previousOutcomeMap.has(id)),
        outcomesRemoved: [...previousOutcomeMap.keys()].filter((id) => !currentOutcomeMap.has(id)),
        outcomeCoverageChanged: [...currentOutcomeMap.entries()]
          .filter(([id, level]) => previousOutcomeMap.has(id) && previousOutcomeMap.get(id) !== level)
          .map(([id]) => id),
        dependentRuns: Number(dependencies?.rows[0]?.runs ?? 0),
        dependentEnrolments: Number(dependencies?.rows[0]?.enrolments ?? 0),
      },
    );
  }

  private async analyseProgramme(
    client: PoolClient,
    institutionId: string,
    resourceId: string,
  ): Promise<AnalysisResult> {
    const result = await client.query(
      `SELECT version.*,programme.code,programme.programme_type
       FROM programme_versions version
       JOIN programmes programme ON programme.id=version.programme_id
       WHERE version.id=$1 AND version.institution_id=$2`,
      [resourceId, institutionId],
    );
    const programme = result.rows[0];
    if (!programme) throw new NotFoundException("Programme version was not found");
    const policy = await this.currentPolicy(client, institutionId);
    const issues = this.validateCreditsAndDuration(programme, policy, true);
    const composition = await client.query(
      `SELECT link.course_blueprint_version_id,link.requirement_type,link.credit_contribution,
              blueprint.credit_value,blueprint.notional_hours,blueprint.course_definition_id,
              definition.code,definition.title
       FROM programme_version_courses link
       JOIN course_blueprint_versions blueprint ON blueprint.id=link.course_blueprint_version_id
       JOIN course_definitions definition ON definition.id=blueprint.course_definition_id
       WHERE link.programme_version_id=$1
       ORDER BY link.sequence_number`,
      [resourceId],
    );
    if (composition.rowCount === 0) {
      issues.push({
        code: "programme-composition-empty",
        severity: "error",
        field: "courses",
        message: "A programme must contain at least one approved course blueprint.",
      });
    }
    const calculatedCredit = composition.rows.reduce(
      (sum, row) => sum + Number(row.credit_contribution ?? row.credit_value ?? 0),
      0,
    );
    const calculatedHours = composition.rows.reduce(
      (sum, row) => sum + Number(row.notional_hours ?? 0),
      0,
    );
    if (
      programme.credit_value !== null &&
      Math.abs(Number(programme.credit_value) - calculatedCredit) > 0.001
    ) {
      issues.push({
        code: "programme-credit-mismatch",
        severity: "error",
        field: "creditValue",
        message: "Programme credit does not equal the approved course composition.",
        actual: Number(programme.credit_value),
        expected: calculatedCredit,
      });
    }
    if (
      programme.notional_hours !== null &&
      Number(programme.notional_hours) !== calculatedHours
    ) {
      issues.push({
        code: "programme-hours-mismatch",
        severity: "error",
        field: "notionalHours",
        message: "Programme notional hours do not equal the approved course composition.",
        actual: Number(programme.notional_hours),
        expected: calculatedHours,
      });
    }

    const requirements = await client.query(
      `SELECT requirement.learning_outcome_id,requirement.minimum_coverage_level,
              outcome.code,outcome.title
       FROM programme_outcome_requirements requirement
       JOIN learning_outcomes outcome ON outcome.id=requirement.learning_outcome_id
       WHERE requirement.programme_version_id=$1
       ORDER BY outcome.code`,
      [resourceId],
    );
    const actualCoverage = await client.query(
      `SELECT mapping.learning_outcome_id,
              max(CASE mapping.coverage_level
                    WHEN 'introduced' THEN 1 WHEN 'developed' THEN 2
                    WHEN 'mastered' THEN 3 WHEN 'assessed' THEN 4 ELSE 0 END)::int rank,
              (array_agg(mapping.coverage_level ORDER BY CASE mapping.coverage_level
                    WHEN 'introduced' THEN 1 WHEN 'developed' THEN 2
                    WHEN 'mastered' THEN 3 WHEN 'assessed' THEN 4 ELSE 0 END DESC))[1] coverage_level
       FROM programme_version_courses link
       JOIN blueprint_outcome_mappings mapping
         ON mapping.course_blueprint_version_id=link.course_blueprint_version_id
       WHERE link.programme_version_id=$1
       GROUP BY mapping.learning_outcome_id`,
      [resourceId],
    );
    const actualByOutcome = new Map(
      actualCoverage.rows.map((row) => [row.learning_outcome_id, row]),
    );
    const requirementCoverage = requirements.rows.map((requirement) => {
      const actual = actualByOutcome.get(requirement.learning_outcome_id);
      const passed = Boolean(
        actual && Number(actual.rank) >= coverageRank[requirement.minimum_coverage_level],
      );
      if (!passed) {
        issues.push({
          code: "programme-outcome-under-covered",
          severity: "error",
          field: "outcomes",
          message: `${requirement.code} does not meet its required coverage level.`,
          actual: actual?.coverage_level ?? "not-mapped",
          expected: requirement.minimum_coverage_level,
        });
      }
      return {
        ...requirement,
        actualCoverageLevel: actual?.coverage_level ?? null,
        passed,
      };
    });

    const previous = await client.query(
      `SELECT id,title,credit_value,notional_hours,duration_value,duration_unit,version_number
       FROM programme_versions
       WHERE programme_id=$1 AND lifecycle='approved' AND id <> $2
       ORDER BY version_number DESC LIMIT 1`,
      [programme.programme_id, resourceId],
    );
    const previousId = previous.rows[0]?.id as string | undefined;
    const previousComposition = previousId
      ? await client.query(
          "SELECT course_blueprint_version_id FROM programme_version_courses WHERE programme_version_id=$1",
          [previousId],
        )
      : { rows: [] };
    const currentBlueprints = new Set(composition.rows.map((row) => row.course_blueprint_version_id));
    const previousBlueprints = new Set(
      previousComposition.rows.map((row) => row.course_blueprint_version_id),
    );
    return this.buildAnalysis(
      "programme-version",
      resourceId,
      programme.version,
      policy,
      issues,
      {
        requirements: requirementCoverage,
        totalRequired: requirements.rowCount,
        passed: requirementCoverage.filter((requirement) => requirement.passed).length,
        uniqueOutcomesCovered: actualCoverage.rowCount,
      },
      {
        comparedToResourceId: previousId,
        changedFields: previous.rows[0]
          ? ["title", "credit_value", "notional_hours", "duration_value", "duration_unit"].filter(
              (field) => JSON.stringify(previous.rows[0][field]) !== JSON.stringify(programme[field]),
            )
          : [],
        blueprintVersionsAdded: [...currentBlueprints].filter((id) => !previousBlueprints.has(id)),
        blueprintVersionsRemoved: [...previousBlueprints].filter((id) => !currentBlueprints.has(id)),
        calculatedCredit,
        calculatedNotionalHours: calculatedHours,
      },
    );
  }

  private validateCreditsAndDuration(
    row: Record<string, unknown>,
    policy: Record<string, unknown>,
    isProgramme: boolean,
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = [];
    const credit = row.credit_value === null ? undefined : Number(row.credit_value);
    const hours = row.notional_hours === null ? undefined : Number(row.notional_hours);
    if (policy.credit_required && credit === undefined) {
      issues.push({ code: "credit-required", severity: "error", field: "creditValue", message: "Credit value is required by institution policy." });
    }
    if (policy.notional_hours_required && hours === undefined) {
      issues.push({ code: "notional-hours-required", severity: "error", field: "notionalHours", message: "Notional hours are required by institution policy." });
    }
    if (isProgramme && policy.duration_required && (!row.duration_value || !row.duration_unit)) {
      issues.push({ code: "duration-required", severity: "error", field: "duration", message: "Programme duration is required by institution policy." });
    }
    if (credit !== undefined && policy.minimum_credit !== null && credit < Number(policy.minimum_credit)) {
      issues.push({ code: "credit-below-minimum", severity: "error", field: "creditValue", message: "Credit value is below the institution minimum.", actual: credit, expected: policy.minimum_credit });
    }
    if (credit !== undefined && policy.maximum_credit !== null && credit > Number(policy.maximum_credit)) {
      issues.push({ code: "credit-above-maximum", severity: "error", field: "creditValue", message: "Credit value exceeds the institution maximum.", actual: credit, expected: policy.maximum_credit });
    }
    if (hours !== undefined && policy.minimum_notional_hours !== null && hours < Number(policy.minimum_notional_hours)) {
      issues.push({ code: "hours-below-minimum", severity: "error", field: "notionalHours", message: "Notional hours are below the institution minimum.", actual: hours, expected: policy.minimum_notional_hours });
    }
    if (hours !== undefined && policy.maximum_notional_hours !== null && hours > Number(policy.maximum_notional_hours)) {
      issues.push({ code: "hours-above-maximum", severity: "error", field: "notionalHours", message: "Notional hours exceed the institution maximum.", actual: hours, expected: policy.maximum_notional_hours });
    }
    if (credit !== undefined && hours !== undefined && policy.hours_per_credit !== null) {
      const expectedHours = credit * Number(policy.hours_per_credit);
      const tolerance = expectedHours * (Number(policy.ratio_tolerance_percent) / 100);
      if (Math.abs(hours - expectedHours) > tolerance) {
        issues.push({ code: "credit-hours-ratio", severity: "error", field: "notionalHours", message: "Notional hours are outside the permitted credit-to-hours tolerance.", actual: hours, expected: expectedHours });
      }
    }
    if (credit === 0 && hours && hours > 0) {
      issues.push({ code: "zero-credit-learning", severity: "warning", field: "creditValue", message: "This curriculum carries no credit despite having notional learning hours." });
    }
    return issues;
  }

  private buildAnalysis(
    resourceType: CurriculumResourceType,
    resourceId: string,
    resourceVersion: number,
    policy: Record<string, unknown>,
    issues: readonly ValidationIssue[],
    outcomeCoverage: Record<string, unknown>,
    impact: Record<string, unknown>,
  ): AnalysisResult {
    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity === "warning");
    return {
      resourceType,
      resourceId,
      resourceVersion,
      validation: {
        passed: errors.length === 0,
        errors,
        warnings,
        policyVersionId: typeof policy.id === "string" ? policy.id : undefined,
      },
      outcomeCoverage,
      impact,
    };
  }

  private async currentPolicy(client: PoolClient, institutionId: string) {
    const result = await client.query(
      `SELECT * FROM curriculum_validation_policies
       WHERE institution_id=$1 AND lifecycle='approved' AND effective_from <= current_date
         AND (effective_until IS NULL OR effective_until > current_date)
       ORDER BY effective_from DESC,version_number DESC LIMIT 1`,
      [institutionId],
    );
    return result.rows[0] ?? {
      id: null,
      credit_required: false,
      notional_hours_required: true,
      duration_required: false,
      hours_per_credit: null,
      ratio_tolerance_percent: 10,
      minimum_credit: null,
      maximum_credit: null,
      minimum_notional_hours: null,
      maximum_notional_hours: null,
    };
  }

  private async persistReview(
    client: PoolClient,
    institutionId: string,
    analysis: AnalysisResult,
  ): Promise<string> {
    const context = this.context.require();
    const id = randomUUID();
    await this.markReviewsStale(client, analysis.resourceType, analysis.resourceId);
    await client.query(
      `INSERT INTO curriculum_change_reviews (
         id,tenant_id,institution_id,resource_type,resource_id,resource_version,
         compared_to_resource_id,impact_snapshot,validation_snapshot,
         outcome_coverage_snapshot,status,generated_by
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'current',$11)`,
      [
        id,
        context.tenantId,
        institutionId,
        analysis.resourceType,
        analysis.resourceId,
        analysis.resourceVersion,
        analysis.impact.comparedToResourceId ?? null,
        analysis.impact,
        analysis.validation,
        analysis.outcomeCoverage,
        context.actorId,
      ],
    );
    await this.record(client, "catalogue.curriculum.impact-reviewed", analysis.resourceType, analysis.resourceId, {
      reviewId: id,
      passed: analysis.validation.passed,
      errorCount: analysis.validation.errors.length,
      warningCount: analysis.validation.warnings.length,
      version: analysis.resourceVersion,
    });
    return id;
  }

  private async markReviewsStale(
    client: PoolClient,
    resourceType: CurriculumResourceType,
    resourceId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE curriculum_change_reviews SET status='stale'
       WHERE resource_type=$1 AND resource_id=$2 AND status='current'`,
      [resourceType, resourceId],
    );
  }

  private validatePolicy(input: CreateCurriculumValidationPolicyDto): void {
    if (
      input.minimumCredit !== undefined &&
      input.maximumCredit !== undefined &&
      input.maximumCredit < input.minimumCredit
    ) {
      throw new BadRequestException("Maximum credit must not be lower than minimum credit");
    }
    if (
      input.minimumNotionalHours !== undefined &&
      input.maximumNotionalHours !== undefined &&
      input.maximumNotionalHours < input.minimumNotionalHours
    ) {
      throw new BadRequestException(
        "Maximum notional hours must not be lower than minimum notional hours",
      );
    }
  }

  private table(resourceType: CurriculumResourceType): "programme_versions" | "course_blueprint_versions" {
    return resourceType === "programme-version"
      ? "programme_versions"
      : "course_blueprint_versions";
  }

  private async requireInstitution(client: PoolClient, institutionId: string): Promise<void> {
    const result = await client.query(
      "SELECT id FROM institutions WHERE id=$1 AND status='active'",
      [institutionId],
    );
    if (!result.rowCount) throw new NotFoundException("Active institution was not found");
  }

  private async record(
    client: PoolClient,
    eventType: string,
    resourceType: string,
    resourceId: string,
    afterState: Record<string, unknown>,
  ): Promise<void> {
    const context = this.context.require();
    await this.audit.append(client, {
      tenantId: context.tenantId,
      plane: "application",
      eventType,
      actorId: context.actorId,
      membershipId: context.membershipId,
      resourceType,
      resourceId,
      correlationId: context.correlationId,
      afterState,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      aggregateType: resourceType,
      aggregateId: resourceId,
      aggregateVersion: Number(afterState.version ?? 1),
      eventName: eventType,
      eventVersion: 1,
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: afterState,
    });
  }
}
