import { randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type { ChangeRelationshipStateDto, DuplicateDecisionDto, MergePeopleDto, ReverseMergeDto, UpsertStaffProfileDto } from "./people.dto.js";

interface PersonRow extends QueryResultRow { id: string; version: number; status: string; }
interface IdRow extends QueryResultRow { id: string; }
interface DuplicateRow extends QueryResultRow {
  id: string; left_person_id: string; right_person_id: string; match_score: string;
  match_reasons: unknown; status: string; created_at: string;
  left_name: string; right_name: string; left_version: number; right_version: number;
}

function encodeDuplicateCursor(row: DuplicateRow): string {
  return Buffer.from(JSON.stringify([row.match_score, row.created_at, row.id]), "utf8").toString("base64url");
}
function decodeDuplicateCursor(value?: string): [number, string, string] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 3 || !Number.isFinite(Number(parsed[0])) || typeof parsed[1] !== "string" || typeof parsed[2] !== "string") throw new Error();
    return [Number(parsed[0]), parsed[1], parsed[2]];
  } catch { throw new BadRequestException("Duplicate-review cursor is invalid"); }
}

@Injectable()
export class PeopleIntegrityService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async upsertStaff(personId: string, institutionId: string, input: UpsertStaffProfileDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const person = await client.query<PersonRow>("SELECT id,version,status FROM people WHERE id=$1 FOR UPDATE", [personId]);
      const current = person.rows[0];
      if (!current) throw new NotFoundException("Person was not found");
      if (current.status === "merged") throw new ConflictException("A merged person cannot receive a staff profile");
      if (current.version !== input.expectedPersonVersion) throw new ConflictException("Person changed since it was loaded");
      const status = input.status === "leave" ? "on_leave" : input.status;
      await client.query(
        `INSERT INTO staff_profiles (
           person_id,tenant_id,institution_id,status,engagement_type,employee_number
         ) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (person_id) DO UPDATE SET
           institution_id=EXCLUDED.institution_id,status=EXCLUDED.status,
           engagement_type=EXCLUDED.engagement_type,employee_number=EXCLUDED.employee_number,
           updated_at=now()`,
        [personId, context.tenantId, institutionId, status, input.engagementType ?? "employee", input.employeeNumber?.trim() || null],
      );
      const version = await client.query<{ version: number } & QueryResultRow>(
        "UPDATE people SET updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1 RETURNING version",
        [personId, context.actorId],
      );
      await this.record(client, "person.staff.profile.updated", personId, { version: current.version }, { version: version.rows[0].version, institutionId, status });
      return { personId, version: version.rows[0].version, status, employeeNumber: input.employeeNumber?.trim() || null };
    });
  }

  async verifyRelationship(id: string, input: ChangeRelationshipStateDto) {
    return this.transitionRelationship(id, input, "verified");
  }

  async revokeRelationship(id: string, input: ChangeRelationshipStateDto) {
    return this.transitionRelationship(id, input, "revoked");
  }

  async listDuplicates(input: { cursor?: string; limit?: number; status?: string }) {
    const context = this.context.require();
    const cursor = decodeDuplicateCursor(input.cursor); const limit = Math.min(Math.max(input.limit ?? 20, 1), 100);
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const values: unknown[] = [input.status ?? "open"]; const conditions = ["candidate.status=$1"];
      if (cursor) { values.push(cursor[0], cursor[1], cursor[2]); conditions.push(`(candidate.match_score,candidate.created_at,candidate.id) < ($2,$3,$4)`); }
      values.push(limit + 1);
      const result = await client.query<DuplicateRow>(
        `SELECT candidate.*, left_person.version left_version, right_person.version right_version,
                concat_ws(' ',left_person.preferred_name,left_person.legal_given_names,left_person.legal_family_name) left_name,
                concat_ws(' ',right_person.preferred_name,right_person.legal_given_names,right_person.legal_family_name) right_name
         FROM person_duplicate_candidates candidate
         JOIN people left_person ON left_person.id=candidate.left_person_id
         JOIN people right_person ON right_person.id=candidate.right_person_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY candidate.match_score DESC,candidate.created_at DESC,candidate.id DESC
         LIMIT $${values.length}`,
        values,
      );
      const rows = result.rows.slice(0, limit); const last = rows.at(-1);
      return {
        items: rows.map((row) => ({ id: row.id, leftPerson: { id: row.left_person_id, displayName: row.left_name.trim(), version: row.left_version }, rightPerson: { id: row.right_person_id, displayName: row.right_name.trim(), version: row.right_version }, matchScore: Number(row.match_score), reasons: row.match_reasons, status: row.status, createdAt: row.created_at })),
        page: { limit, nextCursor: result.rows.length > limit && last ? encodeDuplicateCursor(last) : undefined },
      };
    });
  }

  async decideDuplicate(id: string, input: DuplicateDecisionDto) {
    const context = this.context.require(); const status = input.decision === "confirmed-duplicate" ? "merge_approved" : "confirmed_distinct";
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<IdRow>(
        "UPDATE person_duplicate_candidates SET status=$2,reviewed_by=$3,reviewed_at=now(),review_reason=$4 WHERE id=$1 AND status='open' RETURNING id",
        [id, status, context.actorId, input.reason.trim()],
      );
      if (!result.rows[0]) throw new ConflictException("Duplicate candidate is no longer open");
      await this.record(client, "person.duplicate.reviewed", id, undefined, { decision: input.decision });
      return { id, decision: input.decision };
    });
  }

  async merge(input: MergePeopleDto) {
    if (input.sourcePersonId === input.targetPersonId) throw new BadRequestException("Source and target must differ");
    const context = this.context.require(); const mergeId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const people = await client.query<PersonRow>("SELECT id,version,status FROM people WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[input.sourcePersonId, input.targetPersonId]]);
      if (people.rowCount !== 2) throw new NotFoundException("Merge person was not found");
      const source = people.rows.find((row) => row.id === input.sourcePersonId)!; const target = people.rows.find((row) => row.id === input.targetPersonId)!;
      if (source.version !== input.sourceExpectedVersion || target.version !== input.targetExpectedVersion) throw new ConflictException("A person changed since the merge review");
      if (source.status === "merged" || target.status === "merged") throw new ConflictException("Merged records cannot be merged again");
      const direct = await client.query("SELECT id FROM person_relationships WHERE revoked_at IS NULL AND ((subject_person_id=$1 AND related_person_id=$2) OR (subject_person_id=$2 AND related_person_id=$1)) LIMIT 1", [source.id, target.id]);
      if (direct.rowCount) throw new ConflictException("Resolve the direct relationship between these people before merging");
      const sourceLearner = await client.query<IdRow>("SELECT person_id id FROM learner_profiles WHERE person_id=$1", [source.id]);
      const targetLearner = await client.query<IdRow>("SELECT person_id id FROM learner_profiles WHERE person_id=$1", [target.id]);
      const sourceStaff = await client.query<IdRow>("SELECT person_id id FROM staff_profiles WHERE person_id=$1", [source.id]);
      const targetStaff = await client.query<IdRow>("SELECT person_id id FROM staff_profiles WHERE person_id=$1", [target.id]);
      if (sourceLearner.rowCount && targetLearner.rowCount) throw new ConflictException("Both people have learner profiles; reconcile them before merging");
      if (sourceStaff.rowCount && targetStaff.rowCount) throw new ConflictException("Both people have staff profiles; reconcile them before merging");

      const moved: Record<string, string[]> = {};
      for (const table of ["person_contact_points", "person_addresses", "person_identifiers", "person_organisational_assignments", "person_consents", "person_disclosure_restrictions"]) {
        const rows = await client.query<IdRow>(`UPDATE ${table} SET person_id=$2 WHERE person_id=$1 RETURNING id`, [source.id, target.id]); moved[table] = rows.rows.map((row) => row.id);
      }
      const subjectRelationships = await client.query<IdRow>("UPDATE person_relationships SET subject_person_id=$2,version=version+1 WHERE subject_person_id=$1 RETURNING id", [source.id, target.id]);
      const relatedRelationships = await client.query<IdRow>("UPDATE person_relationships SET related_person_id=$2,version=version+1 WHERE related_person_id=$1 RETURNING id", [source.id, target.id]);
      moved.relationship_subject = subjectRelationships.rows.map((row) => row.id); moved.relationship_related = relatedRelationships.rows.map((row) => row.id);
      if (sourceLearner.rowCount) { await client.query("UPDATE learner_profiles SET person_id=$2,updated_at=now() WHERE person_id=$1", [source.id, target.id]); moved.learner_profile = [target.id]; }
      if (sourceStaff.rowCount) { await client.query("UPDATE staff_profiles SET person_id=$2,updated_at=now() WHERE person_id=$1", [source.id, target.id]); moved.staff_profile = [target.id]; }
      await client.query("UPDATE people SET status='merged',merged_into_person_id=$2,updated_by=$3,updated_at=now(),version=version+1 WHERE id=$1", [source.id, target.id, context.actorId]);
      await client.query("UPDATE people SET updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1", [target.id, context.actorId]);
      await client.query(
        "INSERT INTO person_merges (id,tenant_id,surviving_person_id,merged_person_id,merge_plan,reversal_plan,reason,approved_by) VALUES ($1,$2,$3,$4,$5,$5,$6,$7)",
        [mergeId, context.tenantId, target.id, source.id, { moved }, input.reason.trim(), context.actorId],
      );
      await client.query("UPDATE person_duplicate_candidates SET status='merge_approved',reviewed_by=$3,reviewed_at=now(),review_reason=$4 WHERE tenant_id=$1 AND ((left_person_id=$2 AND right_person_id=$5) OR (left_person_id=$5 AND right_person_id=$2)) AND status='open'", [context.tenantId, source.id, context.actorId, input.reason.trim(), target.id]);
      await this.record(client, "person.merged", mergeId, undefined, { sourcePersonId: source.id, targetPersonId: target.id, moved });
      return { mergeId, sourcePersonId: source.id, targetPersonId: target.id, state: "completed" };
    });
  }

  async reverseMerge(mergeId: string, input: ReverseMergeDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query("SELECT * FROM person_merges WHERE id=$1 FOR UPDATE", [mergeId]); const merge = result.rows[0];
      if (!merge) throw new NotFoundException("Merge was not found");
      if (merge.status !== "completed") throw new ConflictException("Merge is already reversed");
      const source = await client.query<PersonRow>("SELECT id,version,status FROM people WHERE id=$1 FOR UPDATE", [merge.merged_person_id]);
      const target = await client.query<PersonRow>("SELECT id,version,status FROM people WHERE id=$1 FOR UPDATE", [merge.surviving_person_id]);
      if (!source.rows[0] || !target.rows[0] || source.rows[0].status !== "merged") throw new ConflictException("Merge records no longer match the people state");
      const moved = (merge.reversal_plan?.moved ?? {}) as Record<string, string[]>;
      for (const table of ["person_contact_points", "person_addresses", "person_identifiers", "person_organisational_assignments", "person_consents", "person_disclosure_restrictions"]) {
        const ids = moved[table] ?? []; if (ids.length) await client.query(`UPDATE ${table} SET person_id=$2 WHERE id=ANY($1::uuid[])`, [ids, merge.merged_person_id]);
      }
      if ((moved.relationship_subject ?? []).length) await client.query("UPDATE person_relationships SET subject_person_id=$2,version=version+1 WHERE id=ANY($1::uuid[])", [moved.relationship_subject, merge.merged_person_id]);
      if ((moved.relationship_related ?? []).length) await client.query("UPDATE person_relationships SET related_person_id=$2,version=version+1 WHERE id=ANY($1::uuid[])", [moved.relationship_related, merge.merged_person_id]);
      if ((moved.learner_profile ?? []).length) await client.query("UPDATE learner_profiles SET person_id=$2,updated_at=now() WHERE person_id=$1", [merge.surviving_person_id, merge.merged_person_id]);
      if ((moved.staff_profile ?? []).length) await client.query("UPDATE staff_profiles SET person_id=$2,updated_at=now() WHERE person_id=$1", [merge.surviving_person_id, merge.merged_person_id]);
      await client.query("UPDATE people SET status='active',merged_into_person_id=NULL,updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1", [merge.merged_person_id, context.actorId]);
      await client.query("UPDATE people SET updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1", [merge.surviving_person_id, context.actorId]);
      await client.query("UPDATE person_merges SET status='reversed',reversed_by=$2,reversed_at=now(),reversal_reason=$3 WHERE id=$1", [mergeId, context.actorId, input.reason.trim()]);
      await this.record(client, "person.merge.reversed", mergeId, undefined, { restoredPersonId: merge.merged_person_id, moved });
      return { mergeId, state: "reversed", restoredPersonId: merge.merged_person_id };
    });
  }

  private async transitionRelationship(id: string, input: ChangeRelationshipStateDto, state: "verified" | "revoked") {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const query = state === "verified"
        ? "UPDATE person_relationships SET verified_at=now(),verified_by=$3,version=version+1 WHERE id=$1 AND version=$2 AND verified_at IS NULL AND revoked_at IS NULL RETURNING id,version"
        : "UPDATE person_relationships SET revoked_at=now(),revoked_by=$3,revocation_reason=$4,version=version+1 WHERE id=$1 AND version=$2 AND revoked_at IS NULL RETURNING id,version";
      const values = state === "verified" ? [id, input.expectedVersion, context.actorId] : [id, input.expectedVersion, context.actorId, input.reason.trim()];
      const result = await client.query<{ id: string; version: number } & QueryResultRow>(query, values);
      if (!result.rows[0]) throw new ConflictException("Relationship changed since it was loaded");
      await this.record(client, `person.relationship.${state}`, id, { version: input.expectedVersion }, { version: result.rows[0].version, reason: input.reason.trim() });
      return { id, state, version: result.rows[0].version };
    });
  }

  private async record(client: PoolClient, eventType: string, resourceId: string, beforeState?: Record<string, unknown>, afterState?: Record<string, unknown>) {
    const context = this.context.require();
    await this.audit.append(client, { tenantId: context.tenantId, plane: "application", eventType, actorId: context.actorId, membershipId: context.membershipId, resourceType: "person", resourceId, correlationId: context.correlationId, beforeState, afterState });
    await this.outbox.append(client, { tenantId: context.tenantId, aggregateType: "person", aggregateId: resourceId, aggregateVersion: Number(afterState?.version ?? 1), eventName: eventType, eventVersion: 1, actorId: context.actorId, correlationId: context.correlationId, payload: afterState ?? {} });
  }
}
