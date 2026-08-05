import { ConflictException, Injectable } from "@nestjs/common";
import type { MembershipId, TenantId, UserId } from "@veza/contracts";
import type { PoolClient, QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";

interface IdentityLinkRow extends QueryResultRow {
  id: string;
  tenant_id: string;
  person_id: string;
  institution_id: string;
  status: string;
}

@Injectable()
export class PersonIdentityAcceptanceService {
  constructor(
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async complete(
    client: PoolClient,
    invitationId: string,
    userId: UserId,
    membershipId: MembershipId,
    correlationId: string,
  ): Promise<void> {
    const result = await client.query<IdentityLinkRow>(
      `SELECT id,tenant_id,person_id,institution_id,status
       FROM person_identity_link_requests
       WHERE membership_invitation_id=$1 AND status='pending'
       FOR UPDATE`,
      [invitationId],
    );
    const link = result.rows[0];
    if (!link) return;

    const duplicate = await client.query(
      `SELECT id FROM people
       WHERE tenant_id=$1 AND linked_user_id=$2 AND status <> 'merged' AND id <> $3`,
      [link.tenant_id, userId, link.person_id],
    );
    if (duplicate.rowCount) {
      throw new ConflictException("Accepted identity is already linked to another person in this tenant");
    }

    const person = await client.query<{ linked_user_id: string | null; version: number } & QueryResultRow>(
      `SELECT linked_user_id,version FROM people
       WHERE tenant_id=$1 AND id=$2 AND status <> 'merged'
       FOR UPDATE`,
      [link.tenant_id, link.person_id],
    );
    const current = person.rows[0];
    if (!current) throw new ConflictException("Invited person record is no longer available");
    if (current.linked_user_id && current.linked_user_id !== userId) {
      throw new ConflictException("Invited person record is linked to another identity");
    }

    const updated = await client.query<{ version: number } & QueryResultRow>(
      `UPDATE people
       SET linked_user_id=$3,updated_by=$3,updated_at=now(),version=version+1
       WHERE tenant_id=$1 AND id=$2
       RETURNING version`,
      [link.tenant_id, link.person_id, userId],
    );
    await client.query(
      `UPDATE person_identity_link_requests
       SET status='linked',linked_user_id=$2,completed_at=now(),updated_at=now(),version=version+1
       WHERE id=$1`,
      [link.id, userId],
    );
    await client.query(
      `UPDATE person_relationship_invitations
       SET status='accepted',updated_at=now()
       WHERE identity_link_request_id=$1 AND status='queued'`,
      [link.id],
    );

    const tenantId = link.tenant_id as TenantId;
    const evidence = {
      identityLinkRequestId: link.id,
      personId: link.person_id,
      institutionId: link.institution_id,
      userId,
      invitationId,
      version: updated.rows[0].version,
    };
    await this.audit.append(client, {
      tenantId,
      plane: "control",
      eventType: "person.identity.linked-via-invitation",
      actorId: userId,
      membershipId,
      resourceType: "person",
      resourceId: link.person_id,
      purpose: "accepted institution identity invitation",
      correlationId,
      beforeState: { linkedUserId: current.linked_user_id, version: current.version },
      afterState: evidence,
    });
    await this.outbox.append(client, {
      tenantId,
      eventName: "person.identity.linked",
      eventVersion: 1,
      aggregateType: "person",
      aggregateId: link.person_id,
      aggregateVersion: updated.rows[0].version,
      actorId: userId,
      correlationId,
      payload: evidence,
    });
  }
}
