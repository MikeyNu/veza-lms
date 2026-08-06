import { createHash, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { BaselineRoleKey, TenantId } from "@veza/contracts";
import type { PoolClient, QueryResultRow } from "pg";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import { AccessAdministrationService } from "../../identity-access/application/access-administration.service.js";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import type {
  CreateDataSubjectRequestDto,
  CreateDisclosureRestrictionDto,
  CreateOrganisationalAssignmentDto,
  CreatePersonAddressDto,
  CreatePersonConsentDto,
  CreatePersonContactPointDto,
  CreatePersonIdentifierDto,
  CreateStaffEngagementDto,
  EndStaffEngagementDto,
  InvitePersonIdentityDto,
  InviteRelatedPersonDto,
  ReconcilePeopleImportRowDto,
  ResolvePeopleImportDuplicateDto,
} from "./people-operations.dto.js";

interface PersonRow extends QueryResultRow {
  id: string;
  version: number;
  status: string;
  linked_user_id: string | null;
}
interface VersionRow extends QueryResultRow {
  version: number;
}
interface ImportRow extends QueryResultRow {
  id: string;
  import_id: string;
  validation_status: string;
  matched_person_id: string | null;
  version: number;
}

function normalizeContact(kind: string, value: string): string {
  const trimmed = value.trim();
  return kind === "email" ? trimmed.toLowerCase() : trimmed.replace(/[^+\d]/g, "");
}

function normalizeIdentifier(value: string): string {
  return value.trim().replaceAll(/\s+/g, " ").toLowerCase();
}

@Injectable()
export class PeopleOperationsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly accessAdministration: AccessAdministrationService,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async createContact(personId: string, input: CreatePersonContactPointDto) {
    return this.createPersonChild(personId, input.expectedPersonVersion, async (client, context) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO person_contact_points (
           id,tenant_id,person_id,kind,value,normalized_value,label,is_primary,valid_from
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          context.tenantId,
          personId,
          input.kind,
          input.value.trim(),
          normalizeContact(input.kind, input.value),
          input.label?.trim() || null,
          input.isPrimary,
          input.validFrom ?? new Date().toISOString().slice(0, 10),
        ],
      );
      return { eventType: "person.contact.created", childType: "contact-point", childId: id };
    });
  }

  async createAddress(personId: string, input: CreatePersonAddressDto) {
    if (Object.keys(input.address).length === 0) {
      throw new BadRequestException("Address details are required");
    }
    return this.createPersonChild(personId, input.expectedPersonVersion, async (client, context) => {
      const id = randomUUID();
      await client.query(
        `INSERT INTO person_addresses (
           id,tenant_id,person_id,address_type,address,is_primary,valid_from
         ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          context.tenantId,
          personId,
          input.addressType,
          input.address,
          input.isPrimary,
          input.validFrom ?? new Date().toISOString().slice(0, 10),
        ],
      );
      return { eventType: "person.address.created", childType: "address", childId: id };
    });
  }

  async createIdentifier(personId: string, input: CreatePersonIdentifierDto) {
    return this.createPersonChild(personId, input.expectedPersonVersion, async (client, context) => {
      if (input.institutionId) await this.requireInstitution(client, input.institutionId);
      const id = randomUUID();
      await client.query(
        `INSERT INTO person_identifiers (
           id,tenant_id,person_id,institution_id,identifier_type,identifier_value,
           normalized_value,issuing_authority,valid_from
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          context.tenantId,
          personId,
          input.institutionId ?? null,
          input.identifierType.trim(),
          input.identifierValue.trim(),
          normalizeIdentifier(input.identifierValue),
          input.issuingAuthority?.trim() || null,
          input.validFrom ?? new Date().toISOString().slice(0, 10),
        ],
      );
      return { eventType: "person.identifier.created", childType: "identifier", childId: id };
    });
  }

  async createAssignment(personId: string, input: CreateOrganisationalAssignmentDto) {
    if (input.validUntil && input.validUntil < input.validFrom) {
      throw new BadRequestException("Assignment end date must not precede its start date");
    }
    return this.createPersonChild(personId, input.expectedPersonVersion, async (client, context) => {
      await this.requireInstitution(client, input.institutionId);
      const unit = await client.query(
        `SELECT id FROM organisational_units
         WHERE id=$1 AND institution_id=$2 AND status='active'`,
        [input.organisationalUnitId, input.institutionId],
      );
      if (!unit.rowCount) throw new NotFoundException("Active organisational unit was not found");
      const id = randomUUID();
      await client.query(
        `INSERT INTO person_organisational_assignments (
           id,tenant_id,person_id,institution_id,organisational_unit_id,assignment_type,
           title,is_primary,valid_from,valid_until,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          context.tenantId,
          personId,
          input.institutionId,
          input.organisationalUnitId,
          input.assignmentType.trim(),
          input.title?.trim() || null,
          input.isPrimary,
          input.validFrom,
          input.validUntil ?? null,
          context.actorId,
        ],
      );
      return {
        eventType: "person.organisation-assignment.created",
        childType: "organisational-assignment",
        childId: id,
      };
    });
  }

  async createStaffEngagement(personId: string, input: CreateStaffEngagementDto) {
    return this.createPersonChild(personId, input.expectedPersonVersion, async (client, context) => {
      await this.requireInstitution(client, input.institutionId);
      if (input.organisationalUnitId) {
        const unit = await client.query(
          "SELECT id FROM organisational_units WHERE id=$1 AND institution_id=$2 AND status='active'",
          [input.organisationalUnitId, input.institutionId],
        );
        if (!unit.rowCount) throw new NotFoundException("Active organisational unit was not found");
      }
      const profile = await client.query(
        "SELECT person_id FROM staff_profiles WHERE person_id=$1 AND institution_id=$2",
        [personId, input.institutionId],
      );
      if (!profile.rowCount) {
        throw new ConflictException("A staff profile is required before creating an engagement");
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO staff_engagements (
           id,tenant_id,person_id,institution_id,organisational_unit_id,engagement_type,
           employee_number,title,status,started_on,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,$10,$10)`,
        [
          id,
          context.tenantId,
          personId,
          input.institutionId,
          input.organisationalUnitId ?? null,
          input.engagementType,
          input.employeeNumber?.trim() || null,
          input.title?.trim() || null,
          input.startedOn,
          context.actorId,
        ],
      );
      return {
        eventType: "person.staff-engagement.created",
        childType: "staff-engagement",
        childId: id,
      };
    });
  }

  async endStaffEngagement(engagementId: string, input: EndStaffEngagementDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query<{
        id: string;
        person_id: string;
        started_on: string;
        status: string;
        version: number;
      } & QueryResultRow>(
        `SELECT id,person_id,started_on,status,version
         FROM staff_engagements WHERE id=$1 FOR UPDATE`,
        [engagementId],
      );
      const engagement = result.rows[0];
      if (!engagement) throw new NotFoundException("Staff engagement was not found");
      if (engagement.version !== input.expectedVersion) {
        throw new ConflictException("Staff engagement changed since it was loaded");
      }
      if (!["planned", "active", "on_leave"].includes(engagement.status)) {
        throw new ConflictException("Staff engagement has already ended");
      }
      if (input.endedOn < engagement.started_on) {
        throw new BadRequestException("Engagement end date must not precede its start date");
      }
      const updated = await client.query<VersionRow>(
        `UPDATE staff_engagements
         SET status='ended',ended_on=$3,reason=$4,updated_by=$5,updated_at=now(),version=version+1
         WHERE id=$1 AND version=$2 RETURNING version`,
        [engagementId, input.expectedVersion, input.endedOn, input.reason.trim(), context.actorId],
      );
      await this.record(
        client,
        "person.staff-engagement.ended",
        "staff-engagement",
        engagementId,
        {
          personId: engagement.person_id,
          endedOn: input.endedOn,
          reason: input.reason.trim(),
          version: updated.rows[0].version,
        },
      );
      return { id: engagementId, status: "ended", version: updated.rows[0].version };
    });
  }

  async createConsent(personId: string, input: CreatePersonConsentDto) {
    if (input.status === "granted" && !input.grantedAt) {
      throw new BadRequestException("Granted consent requires a granted timestamp");
    }
    if (input.status === "withdrawn" && !input.withdrawnAt) {
      throw new BadRequestException("Withdrawn consent requires a withdrawn timestamp");
    }
    return this.createPersonChild(personId, input.expectedPersonVersion, async (client, context) => {
      if (input.relationshipId) {
        const relationship = await client.query(
          "SELECT id FROM person_relationships WHERE id=$1 AND (subject_person_id=$2 OR related_person_id=$2)",
          [input.relationshipId, personId],
        );
        if (!relationship.rowCount) {
          throw new NotFoundException("Consent relationship was not found for this person");
        }
      }
      const id = randomUUID();
      await client.query(
        `INSERT INTO person_consents (
           id,tenant_id,person_id,relationship_id,purpose_code,status,evidence,
           granted_at,expires_at,withdrawn_at,recorded_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          id,
          context.tenantId,
          personId,
          input.relationshipId ?? null,
          input.purposeCode.trim(),
          input.status,
          input.evidence,
          input.grantedAt ?? null,
          input.expiresAt ?? null,
          input.withdrawnAt ?? null,
          context.actorId,
        ],
      );
      return { eventType: "person.consent.recorded", childType: "consent", childId: id };
    });
  }

  async createRestriction(personId: string, input: CreateDisclosureRestrictionDto) {
    if (input.effectiveUntil && input.effectiveUntil < input.effectiveFrom) {
      throw new BadRequestException("Restriction end date must not precede its start date");
    }
    return this.createPersonChild(personId, input.expectedPersonVersion, async (client, context) => {
      const id = randomUUID();
      const relationshipTypes = (input.appliesToRelationshipTypes ?? []).map((value) =>
        value.replaceAll("-", "_"),
      );
      await client.query(
        `INSERT INTO person_disclosure_restrictions (
           id,tenant_id,person_id,restriction_code,reason,applies_to_relationship_types,
           effective_from,effective_until,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          context.tenantId,
          personId,
          input.restrictionCode.trim(),
          input.reason.trim(),
          relationshipTypes,
          input.effectiveFrom,
          input.effectiveUntil ?? null,
          context.actorId,
        ],
      );
      return {
        eventType: "person.disclosure-restriction.created",
        childType: "disclosure-restriction",
        childId: id,
      };
    });
  }

  async inviteIdentity(
    request: AuthenticatedRequest,
    personId: string,
    institutionId: string,
    input: InvitePersonIdentityDto,
  ) {
    const context = this.context.require();
    const requestId = randomUUID();
    await this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const person = await this.lockPerson(client, personId, input.expectedPersonVersion);
      if (person.linked_user_id) {
        throw new ConflictException("Person already has a linked identity");
      }
      await client.query(
        `INSERT INTO person_identity_link_requests (
           id,tenant_id,person_id,institution_id,requested_email,requested_role_key,status,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7)`,
        [
          requestId,
          context.tenantId,
          personId,
          institutionId,
          input.email.trim().toLowerCase(),
          input.roleKey,
          context.actorId,
        ],
      );
      const version = await this.bumpPerson(client, personId, context.actorId);
      await this.record(client, "person.identity-invitation.requested", "person", personId, {
        identityLinkRequestId: requestId,
        institutionId,
        roleKey: input.roleKey,
        version,
      });
    });

    try {
      const invitation = await this.accessAdministration.createInvitation(request, {
        email: input.email,
        roleKey: input.roleKey as BaselineRoleKey,
        scopeType: "institution",
        scopeId: institutionId,
        expiresInDays: input.expiresInDays,
      });
      await this.database.withTenantTransaction(context.tenantId, async (client) => {
        await client.query(
          `UPDATE person_identity_link_requests
           SET membership_invitation_id=$2,expires_at=$3,updated_at=now(),version=version+1
           WHERE id=$1 AND status='pending'`,
          [requestId, invitation.invitationId, invitation.expiresAt],
        );
      });
      return { identityLinkRequestId: requestId, ...invitation };
    } catch (error) {
      await this.database.withTenantTransaction(context.tenantId, async (client) => {
        await client.query(
          `UPDATE person_identity_link_requests
           SET status='failed',failure_reason=$2,updated_at=now(),version=version+1
           WHERE id=$1 AND status='pending'`,
          [
            requestId,
            error instanceof Error
              ? error.message.slice(0, 1000)
              : "Identity invitation failed",
          ],
        );
      });
      throw error;
    }
  }

  async inviteRelatedPerson(
    request: AuthenticatedRequest,
    subjectPersonId: string,
    institutionId: string,
    input: InviteRelatedPersonDto,
  ) {
    const context = this.context.require();
    const relatedPersonId = randomUUID();
    const relationshipId = randomUUID();
    await this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await this.lockPerson(client, subjectPersonId, input.expectedPersonVersion);
      const existingContact = await client.query<{ person_id: string } & QueryResultRow>(
        `SELECT person_id FROM person_contact_points
         WHERE kind='email' AND normalized_value=$1 AND valid_until IS NULL LIMIT 1`,
        [input.email.trim().toLowerCase()],
      );
      if (existingContact.rows[0]) {
        throw new ConflictException(
          "A person with this email already exists; create the relationship to the existing person instead",
        );
      }
      await client.query(
        `INSERT INTO people (
           id,tenant_id,legal_given_names,legal_family_name,status,locale,created_by,updated_by
         ) VALUES ($1,$2,$3,$4,'active',$5,$6,$6)`,
        [
          relatedPersonId,
          context.tenantId,
          input.givenName.trim(),
          input.familyName.trim(),
          context.locale,
          context.actorId,
        ],
      );
      await client.query(
        `INSERT INTO person_contact_points (
           id,tenant_id,person_id,kind,value,normalized_value,label,is_primary
         ) VALUES ($1,$2,$3,'email',$4,$5,'Invitation',true)`,
        [
          randomUUID(),
          context.tenantId,
          relatedPersonId,
          input.email.trim(),
          input.email.trim().toLowerCase(),
        ],
      );
      await client.query(
        `INSERT INTO person_relationships (
           id,tenant_id,subject_person_id,related_person_id,institution_id,relationship_type,
           authority,valid_from,valid_until,created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          relationshipId,
          context.tenantId,
          subjectPersonId,
          relatedPersonId,
          institutionId,
          input.relationshipType.replaceAll("-", "_"),
          {
            canReceiveCommunications: input.canReceiveCommunications,
            canAccessRecords: input.canAccessRecords,
          },
          input.startsOn,
          input.endsOn ?? null,
          context.actorId,
        ],
      );
      const version = await this.bumpPerson(client, subjectPersonId, context.actorId);
      await this.record(
        client,
        "person.relationship.invitation-started",
        "person-relationship",
        relationshipId,
        {
          subjectPersonId,
          relatedPersonId,
          institutionId,
          relationshipType: input.relationshipType,
          version,
        },
      );
    });

    const invitation = await this.inviteIdentity(
      request,
      relatedPersonId,
      institutionId,
      {
        email: input.email,
        roleKey: "guardian-sponsor",
        expiresInDays: input.expiresInDays,
        expectedPersonVersion: 1,
      },
    );
    await this.database.withTenantTransaction(context.tenantId, async (client) => {
      await client.query(
        `INSERT INTO person_relationship_invitations (
           id,tenant_id,institution_id,relationship_id,identity_link_request_id,status,created_by
         ) VALUES ($1,$2,$3,$4,$5,'queued',$6)`,
        [
          randomUUID(),
          context.tenantId,
          institutionId,
          relationshipId,
          invitation.identityLinkRequestId,
          context.actorId,
        ],
      );
    });
    return { relatedPersonId, relationshipId, ...invitation };
  }

  async listImportRows(importId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const batch = await client.query("SELECT id,status FROM people_imports WHERE id=$1", [
        importId,
      ]);
      if (!batch.rowCount) throw new NotFoundException("People import was not found");
      const rows = await client.query(
        `SELECT id,row_number,normalized_record,validation_status,validation_errors,
                matched_person_id,committed_person_id,reconciliation_action,reconciliation_reason,version
         FROM people_import_rows WHERE import_id=$1 ORDER BY row_number`,
        [importId],
      );
      return { importId, status: batch.rows[0].status, rows: rows.rows };
    });
  }

  async reconcileImportRow(
    importId: string,
    rowId: string,
    input: ReconcilePeopleImportRowDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireReadyImport(client, importId);
      const row = await this.lockImportRow(client, importId, rowId, input.expectedVersion);
      if (row.validation_status === "committed") {
        throw new ConflictException("Committed import rows cannot be changed");
      }
      const errors: Array<{ field: string; code: string; message: string }> = [];
      if (!input.givenName.trim()) {
        errors.push({ field: "givenName", code: "required", message: "Given name is required" });
      }
      if (!input.familyName.trim()) {
        errors.push({ field: "familyName", code: "required", message: "Family name is required" });
      }
      const email = input.email?.trim().toLowerCase() || null;
      let matchedPersonId: string | null = null;
      if (email) {
        const match = await client.query<{ person_id: string } & QueryResultRow>(
          "SELECT person_id FROM person_contact_points WHERE kind='email' AND normalized_value=$1 AND valid_until IS NULL LIMIT 1",
          [email],
        );
        matchedPersonId = match.rows[0]?.person_id ?? null;
      }
      const status = errors.length ? "invalid" : matchedPersonId ? "duplicate" : "valid";
      const updated = await client.query<VersionRow>(
        `UPDATE people_import_rows
         SET normalized_record=$4,validation_status=$5,validation_errors=$6,matched_person_id=$7,
             reconciliation_action='corrected',reconciliation_reason=$8,reconciled_by=$9,
             reconciled_at=now(),version=version+1
         WHERE id=$1 AND import_id=$2 AND version=$3 RETURNING version`,
        [
          rowId,
          importId,
          input.expectedVersion,
          {
            givenName: input.givenName.trim(),
            familyName: input.familyName.trim(),
            preferredName: input.preferredName?.trim() || null,
            email,
            learnerStatus: input.learnerStatus ?? null,
            staffStatus: input.staffStatus ?? null,
          },
          status,
          errors,
          matchedPersonId,
          input.reason.trim(),
          context.actorId,
        ],
      );
      await this.recalculateImport(client, importId);
      await this.record(client, "people.import-row.reconciled", "people-import-row", rowId, {
        importId,
        status,
        matchedPersonId,
        version: updated.rows[0].version,
      });
      return {
        id: rowId,
        validationStatus: status,
        matchedPersonId,
        version: updated.rows[0].version,
      };
    });
  }

  async resolveImportDuplicate(
    importId: string,
    rowId: string,
    input: ResolvePeopleImportDuplicateDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireReadyImport(client, importId);
      const row = await this.lockImportRow(client, importId, rowId, input.expectedVersion);
      if (row.validation_status !== "duplicate") {
        throw new ConflictException("Only duplicate rows require duplicate resolution");
      }
      const personId = input.matchedPersonId ?? row.matched_person_id;
      if (input.resolution === "link-existing") {
        if (!personId) throw new BadRequestException("Link-existing requires a matched person");
        const person = await client.query(
          "SELECT id FROM people WHERE id=$1 AND status <> 'merged'",
          [personId],
        );
        if (!person.rowCount) throw new NotFoundException("Matched person was not found");
      }
      const validationStatus = input.resolution === "create-new" ? "valid" : "committed";
      const committedPersonId = input.resolution === "link-existing" ? personId : null;
      const updated = await client.query<VersionRow>(
        `UPDATE people_import_rows
         SET validation_status=$4,matched_person_id=CASE WHEN $5='create-new' THEN NULL ELSE matched_person_id END,
             committed_person_id=$6,committed_at=CASE WHEN $4='committed' THEN now() ELSE NULL END,
             reconciliation_action=$5,reconciliation_reason=$7,reconciled_by=$8,reconciled_at=now(),
             version=version+1
         WHERE id=$1 AND import_id=$2 AND version=$3 RETURNING version`,
        [
          rowId,
          importId,
          input.expectedVersion,
          validationStatus,
          input.resolution,
          committedPersonId,
          input.reason.trim(),
          context.actorId,
        ],
      );
      await this.recalculateImport(client, importId);
      await this.record(
        client,
        "people.import-row.duplicate-resolved",
        "people-import-row",
        rowId,
        {
          importId,
          resolution: input.resolution,
          committedPersonId,
          version: updated.rows[0].version,
        },
      );
      return {
        id: rowId,
        validationStatus,
        committedPersonId,
        version: updated.rows[0].version,
      };
    });
  }

  async createDataSubjectRequest(personId: string, input: CreateDataSubjectRequestDto) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const person = await client.query("SELECT * FROM people WHERE id=$1", [personId]);
      if (!person.rows[0]) throw new NotFoundException("Person was not found");
      const [
        contacts,
        addresses,
        identifiers,
        learner,
        staff,
        engagements,
        assignments,
        relationships,
        consents,
        restrictions,
        enrolments,
        identityLinks,
      ] = await Promise.all([
        client.query("SELECT * FROM person_contact_points WHERE person_id=$1 ORDER BY created_at", [
          personId,
        ]),
        client.query("SELECT * FROM person_addresses WHERE person_id=$1 ORDER BY created_at", [
          personId,
        ]),
        client.query("SELECT * FROM person_identifiers WHERE person_id=$1 ORDER BY created_at", [
          personId,
        ]),
        client.query("SELECT * FROM learner_profiles WHERE person_id=$1", [personId]),
        client.query("SELECT * FROM staff_profiles WHERE person_id=$1", [personId]),
        client.query("SELECT * FROM staff_engagements WHERE person_id=$1 ORDER BY started_on", [
          personId,
        ]),
        client.query(
          "SELECT * FROM person_organisational_assignments WHERE person_id=$1 ORDER BY valid_from",
          [personId],
        ),
        client.query(
          "SELECT * FROM person_relationships WHERE subject_person_id=$1 OR related_person_id=$1 ORDER BY created_at",
          [personId],
        ),
        client.query("SELECT * FROM person_consents WHERE person_id=$1 ORDER BY created_at", [
          personId,
        ]),
        client.query(
          "SELECT * FROM person_disclosure_restrictions WHERE person_id=$1 ORDER BY created_at",
          [personId],
        ),
        client.query("SELECT * FROM enrolments WHERE learner_person_id=$1 ORDER BY created_at", [
          personId,
        ]),
        client.query(
          `SELECT id,institution_id,requested_email,requested_role_key,status,linked_user_id,
                  expires_at,completed_at,created_at,updated_at,version
           FROM person_identity_link_requests WHERE person_id=$1 ORDER BY created_at`,
          [personId],
        ),
      ]);
      const snapshot = {
        schemaVersion: 1,
        generatedAt: new Date().toISOString(),
        person: person.rows[0],
        contacts: contacts.rows,
        addresses: addresses.rows,
        identifiers: identifiers.rows,
        learnerProfile: learner.rows[0] ?? null,
        staffProfile: staff.rows[0] ?? null,
        staffEngagements: engagements.rows,
        organisationalAssignments: assignments.rows,
        relationships: relationships.rows,
        consents: consents.rows,
        disclosureRestrictions: restrictions.rows,
        enrolments: enrolments.rows,
        identityLinks: identityLinks.rows,
      };
      const checksum = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
      const requestId = randomUUID();
      await client.query(
        `INSERT INTO person_data_subject_requests (
           id,tenant_id,person_id,request_type,status,reason,export_format,export_snapshot,
           export_checksum,requested_by,ready_at,completed_by
         ) VALUES ($1,$2,$3,$4,'ready',$5,'json',$6,$7,$8,now(),$8)`,
        [
          requestId,
          context.tenantId,
          personId,
          input.requestType,
          input.reason.trim(),
          snapshot,
          checksum,
          context.actorId,
        ],
      );
      await this.record(
        client,
        "person.data-subject-export.ready",
        "person-data-subject-request",
        requestId,
        {
          personId,
          requestType: input.requestType,
          checksum,
          version: 1,
        },
      );
      return {
        id: requestId,
        personId,
        status: "ready",
        exportFormat: "json",
        exportChecksum: checksum,
        snapshot,
        version: 1,
      };
    });
  }

  async getDataSubjectRequest(personId: string, requestId: string) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const result = await client.query(
        `SELECT id,person_id,request_type,status,reason,export_format,export_snapshot,
                export_checksum,requested_at,ready_at,delivered_at,version
         FROM person_data_subject_requests WHERE id=$1 AND person_id=$2`,
        [requestId, personId],
      );
      if (!result.rows[0]) {
        throw new NotFoundException("Data-subject request was not found");
      }
      return result.rows[0];
    });
  }

  private async createPersonChild(
    personId: string,
    expectedVersion: number,
    create: (
      client: PoolClient,
      context: ReturnType<TenantContext["require"]>,
    ) => Promise<{ eventType: string; childType: string; childId: string }>,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.lockPerson(client, personId, expectedVersion);
      const child = await create(client, context);
      const version = await this.bumpPerson(client, personId, context.actorId);
      await this.record(client, child.eventType, child.childType, child.childId, {
        personId,
        version,
      });
      return { id: child.childId, personId, aggregateVersion: version, version: 1 };
    });
  }

  private async lockPerson(
    client: PoolClient,
    personId: string,
    expectedVersion: number,
  ): Promise<PersonRow> {
    const result = await client.query<PersonRow>(
      "SELECT id,version,status,linked_user_id FROM people WHERE id=$1 FOR UPDATE",
      [personId],
    );
    const person = result.rows[0];
    if (!person) throw new NotFoundException("Person was not found");
    if (person.status === "merged") {
      throw new ConflictException("Merged person records cannot be changed");
    }
    if (person.version !== expectedVersion) {
      throw new ConflictException("Person changed since it was loaded");
    }
    return person;
  }

  private async bumpPerson(client: PoolClient, personId: string, actorId: string): Promise<number> {
    const result = await client.query<VersionRow>(
      "UPDATE people SET updated_by=$2,updated_at=now(),version=version+1 WHERE id=$1 RETURNING version",
      [personId, actorId],
    );
    if (!result.rows[0]) throw new NotFoundException("Person was not found");
    return result.rows[0].version;
  }

  private async requireInstitution(client: PoolClient, institutionId: string): Promise<void> {
    const result = await client.query(
      "SELECT id FROM institutions WHERE id=$1 AND status='active'",
      [institutionId],
    );
    if (!result.rowCount) throw new NotFoundException("Active institution was not found");
  }

  private async requireReadyImport(client: PoolClient, importId: string): Promise<void> {
    const result = await client.query(
      "SELECT id FROM people_imports WHERE id=$1 AND status='ready' FOR UPDATE",
      [importId],
    );
    if (!result.rowCount) {
      throw new ConflictException("People import is not open for reconciliation");
    }
  }

  private async lockImportRow(
    client: PoolClient,
    importId: string,
    rowId: string,
    expectedVersion: number,
  ): Promise<ImportRow> {
    const result = await client.query<ImportRow>(
      `SELECT id,import_id,validation_status,matched_person_id,version
       FROM people_import_rows WHERE id=$1 AND import_id=$2 FOR UPDATE`,
      [rowId, importId],
    );
    const row = result.rows[0];
    if (!row) throw new NotFoundException("People import row was not found");
    if (row.version !== expectedVersion) {
      throw new ConflictException("People import row changed since it was loaded");
    }
    return row;
  }

  private async recalculateImport(client: PoolClient, importId: string): Promise<void> {
    await client.query(
      `UPDATE people_imports batch SET
         valid_rows=counts.valid_rows,
         invalid_rows=counts.invalid_rows,
         duplicate_rows=counts.duplicate_rows
       FROM (
         SELECT import_id,
                count(*) FILTER (WHERE validation_status='valid')::int valid_rows,
                count(*) FILTER (WHERE validation_status='invalid')::int invalid_rows,
                count(*) FILTER (WHERE validation_status='duplicate')::int duplicate_rows
         FROM people_import_rows WHERE import_id=$1 GROUP BY import_id
       ) counts
       WHERE batch.id=counts.import_id`,
      [importId],
    );
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
      tenantId: context.tenantId as TenantId,
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
