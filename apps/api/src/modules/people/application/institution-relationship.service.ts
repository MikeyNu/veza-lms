import { ConflictException, Injectable } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type { ChangeRelationshipStateDto } from "./people.dto.js";

interface RelationshipVersionRow extends QueryResultRow {
  readonly id: string;
  readonly version: number;
  readonly subject_person_id: string;
}

@Injectable()
export class InstitutionRelationshipService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  verify(
    relationshipId: string,
    institutionId: string,
    input: ChangeRelationshipStateDto,
  ) {
    return this.transition(relationshipId, institutionId, input, "verified");
  }

  revoke(
    relationshipId: string,
    institutionId: string,
    input: ChangeRelationshipStateDto,
  ) {
    return this.transition(relationshipId, institutionId, input, "revoked");
  }

  private async transition(
    relationshipId: string,
    institutionId: string,
    input: ChangeRelationshipStateDto,
    state: "verified" | "revoked",
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const query =
        state === "verified"
          ? `UPDATE person_relationships
             SET verified_at = now(), verified_by = $4, version = version + 1
             WHERE id = $1
               AND institution_id = $2
               AND version = $3
               AND verified_at IS NULL
               AND revoked_at IS NULL
             RETURNING id, version, subject_person_id`
          : `UPDATE person_relationships
             SET revoked_at = now(), revoked_by = $4,
                 revocation_reason = $5, version = version + 1
             WHERE id = $1
               AND institution_id = $2
               AND version = $3
               AND revoked_at IS NULL
             RETURNING id, version, subject_person_id`;
      const values =
        state === "verified"
          ? [relationshipId, institutionId, input.expectedVersion, context.actorId]
          : [
              relationshipId,
              institutionId,
              input.expectedVersion,
              context.actorId,
              input.reason.trim(),
            ];
      const result = await client.query<RelationshipVersionRow>(query, values);
      const relationship = result.rows[0];
      if (!relationship) {
        throw new ConflictException(
          "Relationship changed, belongs to another institution, or is no longer actionable",
        );
      }

      await this.record(
        client,
        `person.relationship.${state}`,
        relationship.id,
        relationship.subject_person_id,
        institutionId,
        input.expectedVersion,
        relationship.version,
        input.reason.trim(),
      );
      return {
        id: relationship.id,
        institutionId,
        state,
        version: relationship.version,
      };
    });
  }

  private async record(
    client: PoolClient,
    eventType: string,
    relationshipId: string,
    personId: string,
    institutionId: string,
    previousVersion: number,
    version: number,
    reason: string,
  ) {
    const context = this.context.require();
    const evidence = { institutionId, personId, version, reason };
    await this.audit.append(client, {
      tenantId: context.tenantId,
      plane: "application",
      eventType,
      actorId: context.actorId,
      membershipId: context.membershipId,
      resourceType: "person-relationship",
      resourceId: relationshipId,
      correlationId: context.correlationId,
      beforeState: { version: previousVersion },
      afterState: evidence,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      aggregateType: "person-relationship",
      aggregateId: relationshipId,
      aggregateVersion: version,
      eventName: eventType,
      eventVersion: 1,
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: evidence,
    });
  }
}
