import { createHash, randomUUID } from "node:crypto";
import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type { CommitPeopleImportDto, CreatePersonDto, CreateRelationshipDto, DuplicateDecisionDto, ListPeopleDto, MergePeopleDto, ReverseMergeDto, StagePeopleImportDto, UpdatePersonDto, UpsertLearnerProfileDto, UpsertStaffProfileDto, ChangeRelationshipStateDto } from "./people.dto.js";

interface PersonRow extends QueryResultRow {
  id: string; version: number; legal_given_names: string; legal_family_name: string;
  preferred_name: string | null; date_of_birth: string | null; locale: string; status: string;
  linked_user_id: string | null; updated_at: string;
}
interface IdRow extends QueryResultRow { id: string; }
interface VersionRow extends QueryResultRow { id: string; version: number; }

function encodeCursor(row: Pick<PersonRow, "legal_family_name" | "legal_given_names" | "id">): string {
  return Buffer.from(JSON.stringify([row.legal_family_name, row.legal_given_names, row.id]), "utf8").toString("base64url");
}
function decodeCursor(value?: string): [string, string, string] | undefined {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!Array.isArray(parsed) || parsed.length !== 3 || parsed.some((item) => typeof item !== "string")) throw new Error();
    return parsed as [string, string, string];
  } catch { throw new BadRequestException("People cursor is invalid"); }
}
function normaliseContact(kind: string, value: string): string {
  const trimmed = value.trim();
  return kind === "email" ? trimmed.toLowerCase() : trimmed.replace(/[^+\d]/g, "");
}
function parseCsv(text: string): readonly Record<string, string>[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2 || lines.length > 10_001) throw new BadRequestException("CSV must contain a header and no more than 10,000 data rows");
  const read = (line: string) => { const values: string[] = []; let value = ""; let quoted = false; for (let i = 0; i < line.length; i += 1) { const c = line[i]; if (c === '"' && quoted && line[i + 1] === '"') { value += '"'; i += 1; } else if (c === '"') quoted = !quoted; else if (c === ',' && !quoted) { values.push(value.trim()); value = ""; } else value += c; } values.push(value.trim()); return values; };
  const headers = read(lines[0]).map((header) => header.toLowerCase());
  const required = ["given_name", "family_name"];
  if (required.some((field) => !headers.includes(field))) throw new BadRequestException("CSV requires given_name and family_name columns");
  return lines.slice(1).map((line) => Object.fromEntries(headers.map((header, index) => [header, read(line)[index] ?? ""])));
}

@Injectable()
export class PeopleService {
  constructor(private readonly database: DatabaseService, private readonly context: TenantContext, private readonly audit: AuditWriter, private readonly outbox: OutboxWriter) {}

  async list(input: ListPeopleDto) {
    const context = this.context.require(); const cursor = decodeCursor(input.cursor); const limit = input.limit ?? 30;
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const values: unknown[] = []; const conditions = ["p.status <> 'merged'"];
      if (input.search) { values.push(`%${input.search.trim().toLowerCase()}%`); conditions.push(`(lower(p.legal_given_names || ' ' || p.legal_family_name) LIKE $${values.length} OR EXISTS (SELECT 1 FROM person_contact_points c WHERE c.person_id=p.id AND c.normalized_value LIKE $${values.length}) OR EXISTS (SELECT 1 FROM person_identifiers i WHERE i.person_id=p.id AND lower(i.normalized_value) LIKE $${values.length}))`); }
      if (input.status) { values.push(input.status); conditions.push(`p.status = $${values.length}`); }
      if (input.learnersOnly) conditions.push("EXISTS (SELECT 1 FROM learner_profiles l WHERE l.person_id=p.id)");
      if (input.staffOnly) conditions.push("EXISTS (SELECT 1 FROM staff_profiles s WHERE s.person_id=p.id)");
      if (cursor) { values.push(cursor[0], cursor[1], cursor[2]); conditions.push(`(p.legal_family_name,p.legal_given_names,p.id) > ($${values.length - 2},$${values.length - 1},$${values.length})`); }
      values.push(limit + 1);
      const rows = await client.query<PersonRow & { primary_email: string | null; learner_status: string | null; staff_status: string | null; identifiers: string[] }>(`SELECT p.*, (SELECT value FROM person_contact_points c WHERE c.person_id=p.id AND c.kind='email' AND c.is_primary AND c.valid_until IS NULL LIMIT 1) primary_email, (SELECT status::text FROM learner_profiles l WHERE l.person_id=p.id) learner_status, (SELECT status::text FROM staff_profiles s WHERE s.person_id=p.id) staff_status, COALESCE((SELECT array_agg(identifier_value ORDER BY identifier_type) FROM person_identifiers i WHERE i.person_id=p.id AND i.valid_until IS NULL),'{}') identifiers FROM people p WHERE ${conditions.join(" AND ")} ORDER BY p.legal_family_name,p.legal_given_names,p.id LIMIT $${values.length}`, values);
      const pageRows = rows.rows.slice(0, limit); const last = pageRows.at(-1);
      return { items: pageRows.map((row) => ({ id: row.id, version: row.version, displayName: row.preferred_name || `${row.legal_given_names} ${row.legal_family_name}`, givenName: row.legal_given_names, familyName: row.legal_family_name, preferredName: row.preferred_name ?? undefined, primaryEmail: row.primary_email ?? undefined, status: row.status, learnerStatus: row.learner_status ?? undefined, staffStatus: row.staff_status ?? undefined, institutionalIdentifiers: row.identifiers, updatedAt: row.updated_at })), page: { limit, nextCursor: rows.rows.length > limit && last ? encodeCursor(last) : undefined } };
    });
  }

  async detail(personId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<PersonRow>("SELECT * FROM people WHERE id=$1", [personId]); const person = result.rows[0]; if (!person) throw new NotFoundException("Person was not found");
      const [contacts, learner, staff, relationships] = await Promise.all([
        client.query("SELECT id,kind,value,label,is_primary,is_verified,verification_recorded_at FROM person_contact_points WHERE person_id=$1 AND valid_until IS NULL ORDER BY is_primary DESC,kind", [personId]),
        client.query("SELECT person_id,status,admission_date,exit_date FROM learner_profiles WHERE person_id=$1", [personId]),
        client.query("SELECT person_id,status,engagement_type,started_on,ended_on FROM staff_profiles WHERE person_id=$1", [personId]),
        client.query("SELECT id,related_person_id,relationship_type,authority,valid_from,valid_until,verified_at,revoked_at FROM person_relationships WHERE subject_person_id=$1 ORDER BY created_at DESC", [personId]),
      ]);
      return { ...person, contacts: contacts.rows, learner: learner.rows[0] ?? null, staff: staff.rows[0] ?? null, relationships: relationships.rows };
    });
  }

  async create(input: CreatePersonDto) {
    const context = this.context.require(); const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await client.query("INSERT INTO people (id,tenant_id,linked_user_id,preferred_name,legal_given_names,legal_family_name,date_of_birth,status,locale,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)", [id, context.tenantId, input.userId ?? null, input.preferredName?.trim() ?? null, input.givenName.trim(), input.familyName.trim(), input.dateOfBirth ?? null, input.status ?? "active", input.locale ?? context.locale, context.actorId]);
      for (const contact of input.contacts ?? []) await client.query("INSERT INTO person_contact_points (id,tenant_id,person_id,kind,value,normalized_value,label,is_primary) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(), context.tenantId, id, contact.type === "phone" ? "mobile" : contact.type, contact.value.trim(), normaliseContact(contact.type, contact.value), contact.label?.trim() ?? null, contact.isPrimary]);
      await this.record(client, "person.created", id, undefined, { version: 1, status: input.status ?? "active" });
      return this.detailWithin(client, id);
    });
  }

  async update(personId: string, input: UpdatePersonDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const before = await client.query<PersonRow>("SELECT * FROM people WHERE id=$1 FOR UPDATE", [personId]); if (!before.rows[0]) throw new NotFoundException("Person was not found");
      const updated = await client.query<VersionRow>("UPDATE people SET linked_user_id=$2,preferred_name=$3,legal_given_names=$4,legal_family_name=$5,date_of_birth=$6,status=$7,locale=$8,updated_by=$9,updated_at=now(),version=version+1 WHERE id=$1 AND version=$10 RETURNING id,version", [personId, input.userId ?? null, input.preferredName?.trim() ?? null, input.givenName.trim(), input.familyName.trim(), input.dateOfBirth ?? null, input.status ?? "active", input.locale ?? context.locale, context.actorId, input.expectedVersion]);
      if (!updated.rows[0]) throw new ConflictException("Person changed since it was loaded");
      await this.record(client, "person.updated", personId, before.rows[0], { version: updated.rows[0].version }); return this.detailWithin(client, personId);
    });
  }

  async upsertLearner(personId: string, institutionId: string, input: UpsertLearnerProfileDto) { return this.upsertProfile("learner", personId, institutionId, input); }
  async upsertStaff(personId: string, institutionId: string, input: UpsertStaffProfileDto) { return this.upsertProfile("staff", personId, institutionId, input); }

  async createRelationship(personId: string, institutionId: string | null, input: CreateRelationshipDto) {
    const context = this.context.require(); const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await client.query("INSERT INTO person_relationships (id,tenant_id,subject_person_id,related_person_id,institution_id,relationship_type,authority,valid_from,valid_until,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)", [id, context.tenantId, personId, input.relatedPersonId, institutionId, input.type.replace("-", "_"), { canReceiveCommunications: input.canReceiveCommunications, canAccessRecords: input.canAccessRecords }, input.startsOn, input.endsOn ?? null, context.actorId]);
      await this.record(client, "person.relationship.created", id, undefined, { personId, relatedPersonId: input.relatedPersonId, type: input.type }); return { id, state: "pending" };
    });
  }

  async verifyRelationship(id: string, input: ChangeRelationshipStateDto) { return this.changeRelationship(id, input, "verified"); }
  async revokeRelationship(id: string, input: ChangeRelationshipStateDto) { return this.changeRelationship(id, input, "revoked"); }

  async decideDuplicate(id: string, input: DuplicateDecisionDto) {
    const context = this.context.require(); const status = input.decision === "confirmed-duplicate" ? "merge_approved" : "confirmed_distinct";
    return this.database.withTenantTransaction(context.tenantId, async (client) => { const result = await client.query("UPDATE person_duplicate_candidates SET status=$2,reviewed_by=$3,reviewed_at=now(),review_reason=$4 WHERE id=$1 AND status='open' RETURNING id", [id, status, context.actorId, input.reason.trim()]); if (!result.rows[0]) throw new ConflictException("Duplicate candidate is no longer open"); await this.record(client, "person.duplicate.reviewed", id, undefined, { decision: input.decision }); return { id, decision: input.decision }; });
  }

  async merge(input: MergePeopleDto) {
    if (input.sourcePersonId === input.targetPersonId) throw new BadRequestException("Source and target must differ"); const context = this.context.require(); const mergeId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const people = await client.query<PersonRow>("SELECT * FROM people WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE", [[input.sourcePersonId, input.targetPersonId]]); if (people.rowCount !== 2) throw new NotFoundException("Merge person was not found");
      const source = people.rows.find((row) => row.id === input.sourcePersonId)!; const target = people.rows.find((row) => row.id === input.targetPersonId)!;
      if (source.version !== input.sourceExpectedVersion || target.version !== input.targetExpectedVersion) throw new ConflictException("A person changed since the merge review");
      if (source.status === "merged" || target.status === "merged") throw new ConflictException("Merged records cannot be merged again");
      const moved: Record<string, string[]> = {};
      for (const table of ["person_contact_points", "person_addresses", "person_identifiers", "person_organisational_assignments", "person_consents", "person_disclosure_restrictions"]) { const rows = await client.query<IdRow>(`UPDATE ${table} SET person_id=$2 WHERE person_id=$1 RETURNING id`, [source.id, target.id]); moved[table] = rows.rows.map((row) => row.id); }
      await client.query("UPDATE person_relationships SET subject_person_id=$2 WHERE subject_person_id=$1", [source.id, target.id]); await client.query("UPDATE person_relationships SET related_person_id=$2 WHERE related_person_id=$1", [source.id, target.id]);
      await client.query("UPDATE people SET status='merged',merged_into_person_id=$2,updated_by=$3,updated_at=now(),version=version+1 WHERE id=$1", [source.id, target.id, context.actorId]);
      await client.query("UPDATE people SET updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1", [target.id, context.actorId]);
      await client.query("INSERT INTO person_merges (id,tenant_id,surviving_person_id,merged_person_id,merge_plan,reversal_plan,reason,approved_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", [mergeId, context.tenantId, target.id, source.id, { moved }, { moved }, input.reason.trim(), context.actorId]);
      await this.record(client, "person.merged", mergeId, undefined, { sourcePersonId: source.id, targetPersonId: target.id }); return { mergeId, sourcePersonId: source.id, targetPersonId: target.id, state: "completed" };
    });
  }

  async reverseMerge(mergeId: string, input: ReverseMergeDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query("SELECT * FROM person_merges WHERE id=$1 FOR UPDATE", [mergeId]); const merge = result.rows[0]; if (!merge) throw new NotFoundException("Merge was not found"); if (merge.status !== "completed") throw new ConflictException("Merge is already reversed");
      const moved = (merge.reversal_plan?.moved ?? {}) as Record<string, string[]>;
      for (const [table, ids] of Object.entries(moved)) if (ids.length) await client.query(`UPDATE ${table} SET person_id=$2 WHERE id=ANY($1::uuid[])`, [ids, merge.merged_person_id]);
      await client.query("UPDATE people SET status='active',merged_into_person_id=NULL,updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1", [merge.merged_person_id, context.actorId]);
      await client.query("UPDATE person_merges SET status='reversed',reversed_by=$2,reversed_at=now(),reversal_reason=$3 WHERE id=$1", [mergeId, context.actorId, input.reason.trim()]); await this.record(client, "person.merge.reversed", mergeId, undefined, { restoredPersonId: merge.merged_person_id }); return { mergeId, state: "reversed" };
    });
  }

  async stageImport(input: StagePeopleImportDto) {
    const context = this.context.require(); const rows = parseCsv(input.csv); const checksum = createHash("sha256").update(input.csv).digest("hex"); const importId = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await client.query("INSERT INTO people_imports (id,tenant_id,institution_id,source_filename,source_checksum,status,total_rows,created_by) VALUES ($1,$2,$3,$4,$5,'validating',$6,$7)", [importId, context.tenantId, input.institutionId, input.filename, checksum, rows.length, context.actorId]); let valid = 0; let invalid = 0; let duplicate = 0; const errors: unknown[] = [];
      for (let index = 0; index < rows.length; index += 1) { const row = rows[index]; const rowErrors: { field?: string; code: string; message: string }[] = []; if (!row.given_name?.trim()) rowErrors.push({ field: "given_name", code: "required", message: "Given name is required" }); if (!row.family_name?.trim()) rowErrors.push({ field: "family_name", code: "required", message: "Family name is required" }); if (row.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(row.email)) rowErrors.push({ field: "email", code: "invalid", message: "Email is invalid" }); let matched: string | null = null; if (!rowErrors.length && row.email) { const match = await client.query<IdRow>("SELECT person_id id FROM person_contact_points WHERE kind='email' AND normalized_value=$1 AND valid_until IS NULL LIMIT 1", [row.email.toLowerCase()]); matched = match.rows[0]?.id ?? null; } const state = rowErrors.length ? "invalid" : matched ? "duplicate" : "valid"; if (state === "valid") valid += 1; else if (state === "duplicate") duplicate += 1; else invalid += 1; errors.push(...rowErrors.map((error) => ({ rowNumber: index + 2, ...error }))); await client.query("INSERT INTO people_import_rows (id,tenant_id,import_id,row_number,raw_record,normalized_record,validation_status,validation_errors,matched_person_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", [randomUUID(), context.tenantId, importId, index + 2, row, { givenName: row.given_name?.trim(), familyName: row.family_name?.trim(), preferredName: row.preferred_name?.trim() || null, email: row.email?.trim().toLowerCase() || null, learnerStatus: row.learner_status?.trim() || null, staffStatus: row.staff_status?.trim() || null }, state, rowErrors, matched]); }
      await client.query("UPDATE people_imports SET status='ready',valid_rows=$2,invalid_rows=$3,duplicate_rows=$4 WHERE id=$1", [importId, valid, invalid, duplicate]); await this.record(client, "people.import.staged", importId, undefined, { totalRows: rows.length, validRows: valid, invalidRows: invalid, duplicateRows: duplicate }); return { importId, status: "ready", totalRows: rows.length, validRows: valid, invalidRows: invalid, duplicateRows: duplicate, errors };
    });
  }

  async commitImport(importId: string, input: CommitPeopleImportDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => { const batch = await client.query("UPDATE people_imports SET status='committing' WHERE id=$1 AND status='ready' AND invalid_rows=0 RETURNING institution_id", [importId]); if (!batch.rows[0]) throw new ConflictException("Import is not ready or contains invalid rows"); const rows = await client.query("SELECT id,normalized_record FROM people_import_rows WHERE import_id=$1 AND validation_status='valid' ORDER BY row_number FOR UPDATE", [importId]); let committed = 0; for (const row of rows.rows) { const data = row.normalized_record; const personId = randomUUID(); await client.query("INSERT INTO people (id,tenant_id,preferred_name,legal_given_names,legal_family_name,status,locale,source_system,source_reference,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,'active',$6,'csv-import',$7,$8,$8)", [personId, context.tenantId, data.preferredName, data.givenName, data.familyName, context.locale, `${importId}:${row.id}`, context.actorId]); if (data.email) await client.query("INSERT INTO person_contact_points (id,tenant_id,person_id,kind,value,normalized_value,is_primary) VALUES ($1,$2,$3,'email',$4,$4,true)", [randomUUID(), context.tenantId, personId, data.email]); if (data.learnerStatus) await client.query("INSERT INTO learner_profiles (person_id,tenant_id,institution_id,status) VALUES ($1,$2,$3,$4)", [personId, context.tenantId, batch.rows[0].institution_id, data.learnerStatus]); if (data.staffStatus) await client.query("INSERT INTO staff_profiles (person_id,tenant_id,institution_id,status,engagement_type) VALUES ($1,$2,$3,$4,'employee')", [personId, context.tenantId, batch.rows[0].institution_id, data.staffStatus]); await client.query("UPDATE people_import_rows SET validation_status='committed',committed_person_id=$2,committed_at=now() WHERE id=$1", [row.id, personId]); committed += 1; } await client.query("UPDATE people_imports SET status='completed',completed_at=now() WHERE id=$1", [importId]); await this.record(client, "people.import.completed", importId, undefined, { committed, reason: input.reason.trim() }); return { importId, state: "completed", committed }; });
  }

  private async upsertProfile(kind: "learner" | "staff", personId: string, institutionId: string, input: UpsertLearnerProfileDto | UpsertStaffProfileDto) {
    const context = this.context.require(); return this.database.withTenantTransaction(context.tenantId, async (client) => { const locked = await client.query<PersonRow>("SELECT * FROM people WHERE id=$1 FOR UPDATE", [personId]); if (!locked.rows[0]) throw new NotFoundException("Person was not found"); if (locked.rows[0].version !== input.expectedPersonVersion) throw new ConflictException("Person changed since it was loaded"); if (kind === "learner") { const value = input as UpsertLearnerProfileDto; await client.query("INSERT INTO learner_profiles (person_id,tenant_id,institution_id,status,admission_date,exit_date) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (person_id) DO UPDATE SET institution_id=EXCLUDED.institution_id,status=EXCLUDED.status,admission_date=EXCLUDED.admission_date,exit_date=EXCLUDED.exit_date,updated_at=now()", [personId, context.tenantId, institutionId, value.status === "applicant" ? "prospective" : value.status, value.admissionDate ?? null, value.completionDate ?? null]); } else { const value = input as UpsertStaffProfileDto; await client.query("INSERT INTO staff_profiles (person_id,tenant_id,institution_id,status,engagement_type) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (person_id) DO UPDATE SET institution_id=EXCLUDED.institution_id,status=EXCLUDED.status,engagement_type=EXCLUDED.engagement_type,updated_at=now()", [personId, context.tenantId, institutionId, value.status === "leave" ? "on_leave" : value.status, value.engagementType ?? "employee"]); } const version = await client.query<VersionRow>("UPDATE people SET updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1 RETURNING id,version", [personId, context.actorId]); await this.record(client, `person.${kind}.profile.updated`, personId, undefined, { institutionId, version: version.rows[0].version }); return this.detailWithin(client, personId); });
  }

  private async changeRelationship(id: string, input: ChangeRelationshipStateDto, state: "verified" | "revoked") { const context = this.context.require(); return this.database.withTenantTransaction(context.tenantId, async (client) => { const result = state === "verified" ? await client.query("UPDATE person_relationships SET verified_at=now(),verified_by=$2 WHERE id=$1 AND verified_at IS NULL AND revoked_at IS NULL RETURNING id", [id, context.actorId]) : await client.query("UPDATE person_relationships SET revoked_at=now(),revoked_by=$2,revocation_reason=$3 WHERE id=$1 AND revoked_at IS NULL RETURNING id", [id, context.actorId, input.reason.trim()]); if (!result.rows[0]) throw new ConflictException("Relationship state has changed"); await this.record(client, `person.relationship.${state}`, id, undefined, { reason: input.reason.trim() }); return { id, state }; }); }
  private async detailWithin(client: any, personId: string) { const result = await client.query("SELECT * FROM people WHERE id=$1", [personId]); if (!result.rows[0]) throw new NotFoundException("Person was not found"); return result.rows[0]; }
  private async record(client: any, eventType: string, resourceId: string, beforeState?: Record<string, unknown>, afterState?: Record<string, unknown>) { const context = this.context.require(); await this.audit.append(client, { tenantId: context.tenantId, plane: "application", eventType, actorId: context.actorId, membershipId: context.membershipId, resourceType: "person", resourceId, correlationId: context.correlationId, beforeState, afterState }); await this.outbox.append(client, { tenantId: context.tenantId, aggregateType: "person", aggregateId: resourceId, aggregateVersion: Number(afterState?.version ?? 1), eventName: eventType, eventVersion: 1, actorId: context.actorId, correlationId: context.correlationId, payload: afterState ?? {} }); }
}
