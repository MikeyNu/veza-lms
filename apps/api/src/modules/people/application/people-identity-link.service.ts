import { randomUUID } from "node:crypto";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type { LinkExistingIdentityDto } from "./people-operations.dto.js";

interface PersonRow extends QueryResultRow {
  id: string;
  version: number;
  status: string;
  linked_user_id: string | null;
}

@Injectable()
export class PeopleIdentityLinkService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async linkExisting(
    personId: string,
    institutionId: string,
    input: LinkExistingIdentityDto,
  ) {
    const context = this.context.require();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const personResult = await client.query<PersonRow>(
        `SELECT id,version,status,linked_user_id
         FROM people WHERE id=$1 FOR UPDATE`,
        [personId],
      );
      const person = personResult.rows[0];
      if (!person) throw new NotFoundException("Person was not found");
      if (person.status === "merged") throw new ConflictException("Merged person records cannot be linked");
      if (person.version !== input.expectedPersonVersion) {
        throw new ConflictException("Person changed since it was loaded");
      }
      if (person.linked_user_id) throw new ConflictException("Person already has a linked identity");

      const membership = await client.query(
        `SELECT membership.id
         FROM memberships membership
         WHERE membership.tenant_id=$1 AND membership.user_id=$2
           AND membership.status='active'
           AND (membership.valid_until IS NULL OR membership.valid_until > now())
           AND EXISTS (
             SELECT 1 FROM role_assignments role
             WHERE role.tenant_id=membership.tenant_id
               AND role.membership_id=membership.id
               AND role.valid_from <= now()
               AND (role.valid_until IS NULL OR role.valid_until > now())
               AND (
                 (role.scope_type='tenant' AND role.scope_id=$1)
                 OR (role.scope_type='institution' AND role.scope_id=$3)
               )
           )`,
        [context.tenantId, input.userId, institutionId],
      );
      if (!membership.rowCount) {
        throw new ConflictException(
          "Identity requires an active membership authorised for this institution",
        );
      }

      const duplicate = await client.query(
        `SELECT id FROM people
         WHERE linked_user_id=$1 AND status <> 'merged' AND id <> $2`,
        [input.userId, personId],
      );
      if (duplicate.rowCount) {
        throw new ConflictException("Identity is already linked to another person in this tenant");
      }

      const linkRequestId = randomUUID();
      await client.query(
        `INSERT INTO person_identity_link_requests (
           id,tenant_id,person_id,institution_id,status,linked_user_id,
           completed_at,created_by
         ) VALUES ($1,$2,$3,$4,'linked',$5,now(),$6)`,
        [linkRequestId, context.tenantId, personId, institutionId, input.userId, context.actorId],
      );
      const updated = await client.query<{ version: number } & QueryResultRow>(
        `UPDATE people
         SET linked_user_id=$3,updated_by=$4,updated_at=now(),version=version+1
         WHERE id=$1 AND version=$2
         RETURNING version`,
        [personId, input.expectedPersonVersion, input.userId, context.actorId],
      );
      if (!updated.rows[0]) throw new ConflictException("Person changed since it was loaded");

      const evidence = {
        personId,
        institutionId,
        userId: input.userId,
        identityLinkRequestId: linkRequestId,
        reason: input.reason.trim(),
        version: updated.rows[0].version,
      };
      await this.appendEvidence(client, personId, evidence);
      return {
        personId,
        institutionId,
        userId: input.userId,
        identityLinkRequestId: linkRequestId,
        status: "linked",
        version: updated.rows[0].version,
      };
    });
  }

  private async appendEvidence(
    client: PoolClient,
    personId: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    const context = this.context.require();
    await this.audit.append(client, {
      tenantId: context.tenantId,
      plane: "application",
      eventType: "person.identity.linked",
      actorId: context.actorId,
      membershipId: context.membershipId,
      resourceType: "person",
      resourceId: personId,
      purpose: "institution identity linkage",
      correlationId: context.correlationId,
      afterState: evidence,
    });
    await this.outbox.append(client, {
      tenantId: context.tenantId,
      aggregateType: "person",
      aggregateId: personId,
      aggregateVersion: Number(evidence.version ?? 1),
      eventName: "person.identity.linked",
      eventVersion: 1,
      actorId: context.actorId,
      correlationId: context.correlationId,
      payload: evidence,
    });
  }
}
