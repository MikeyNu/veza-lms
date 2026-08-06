import { randomUUID } from "node:crypto";
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { QueryResultRow } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type { BulkPersonStatusDto } from "./people-bulk.dto.js";

interface PersonStatusRow extends QueryResultRow {
  readonly id: string;
  readonly status: string;
  readonly version: number;
}

interface UpdatedVersionRow extends QueryResultRow {
  readonly version: number;
}

export interface BulkPersonStatusReceipt {
  readonly operationId: string;
  readonly requestedCount: number;
  readonly changedCount: number;
  readonly unchangedCount: number;
  readonly status: "active" | "inactive";
  readonly records: readonly {
    readonly personId: string;
    readonly previousStatus: string;
    readonly status: "active" | "inactive";
    readonly version: number;
    readonly changed: boolean;
  }[];
}

@Injectable()
export class PeopleBulkService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async changeStatus(input: BulkPersonStatusDto): Promise<BulkPersonStatusReceipt> {
    const context = this.context.require();
    const operationId = randomUUID();
    const personIds = input.records.map((record) => record.personId);
    const reason = input.reason.trim();

    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      const locked = await client.query<PersonStatusRow>(
        `SELECT id,status,version
         FROM people
         WHERE id = ANY($1::uuid[])
         ORDER BY id
         FOR UPDATE`,
        [personIds],
      );
      if (locked.rows.length !== personIds.length) {
        throw new NotFoundException("One or more selected people were not found");
      }

      const currentById = new Map(locked.rows.map((row) => [row.id, row]));
      for (const record of input.records) {
        const current = currentById.get(record.personId);
        if (!current) throw new NotFoundException("Selected person was not found");
        if (["merged", "deceased"].includes(current.status)) {
          throw new ConflictException("Merged or deceased records require individual review");
        }
        if (current.version !== record.expectedVersion) {
          throw new ConflictException("A selected person changed since the directory was loaded");
        }
      }

      const results: BulkPersonStatusReceipt["records"][number][] = [];
      for (const record of input.records) {
        const current = currentById.get(record.personId)!;
        if (current.status === input.status) {
          results.push({
            personId: current.id,
            previousStatus: current.status,
            status: input.status,
            version: current.version,
            changed: false,
          });
          continue;
        }

        const updated = await client.query<UpdatedVersionRow>(
          `UPDATE people
           SET status=$2,updated_by=$3,updated_at=now(),version=version+1
           WHERE id=$1 AND version=$4
           RETURNING version`,
          [current.id, input.status, context.actorId, current.version],
        );
        const version = updated.rows[0]?.version;
        if (!version) throw new ConflictException("A selected person changed during the bulk operation");

        const evidence = {
          operationId,
          previousStatus: current.status,
          status: input.status,
          version,
          reason,
        };
        await this.audit.append(client, {
          tenantId: context.tenantId,
          plane: "application",
          eventType: "person.status.changed",
          actorId: context.actorId,
          membershipId: context.membershipId,
          resourceType: "person",
          resourceId: current.id,
          purpose: reason,
          correlationId: context.correlationId,
          beforeState: { status: current.status, version: current.version },
          afterState: { status: input.status, version },
          metadata: { operationId, mode: "bulk" },
        });
        await this.outbox.append(client, {
          tenantId: context.tenantId,
          eventName: "people.person.status-changed",
          eventVersion: 1,
          aggregateType: "person",
          aggregateId: current.id,
          aggregateVersion: version,
          actorId: context.actorId,
          correlationId: context.correlationId,
          payload: evidence,
        });
        results.push({
          personId: current.id,
          previousStatus: current.status,
          status: input.status,
          version,
          changed: true,
        });
      }

      const changedCount = results.filter((result) => result.changed).length;
      return {
        operationId,
        requestedCount: results.length,
        changedCount,
        unchangedCount: results.length - changedCount,
        status: input.status,
        records: results,
      };
    });
  }
}
