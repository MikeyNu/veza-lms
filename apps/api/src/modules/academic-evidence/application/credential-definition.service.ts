import { randomUUID } from "node:crypto";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { PoolClient } from "pg";
import { AuditWriter } from "../../audit/audit-writer.service.js";
import { DatabaseService } from "../../../platform/database/database.service.js";
import { OutboxWriter } from "../../../platform/events/outbox-writer.service.js";
import { TenantContext } from "../../../platform/request-context/tenant-context.js";
import type {
  CreateAwardRuleDto,
  CreateCertificateTemplateDto,
} from "./academic-evidence.dto.js";

@Injectable()
export class CredentialDefinitionService {
  constructor(
    private readonly database: DatabaseService,
    private readonly context: TenantContext,
    private readonly audit: AuditWriter,
    private readonly outbox: OutboxWriter,
  ) {}

  async createTemplate(institutionId: string, input: CreateCertificateTemplateDto) {
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      await client.query(
        `INSERT INTO certificate_templates (
          id,tenant_id,institution_id,title,document_schema,status,version,created_by,updated_by
        ) VALUES ($1,$2,$3,$4,$5,'draft',1,$6,$6)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.title.trim(),
          input.documentSchema,
          context.actorId,
        ],
      );
      await this.record(client, "credentials.template.created", "certificate-template", id, {
        institutionId,
        version: 1,
      });
      return { id, status: "draft", version: 1 };
    });
  }

  async createAwardRule(institutionId: string, input: CreateAwardRuleDto) {
    if (Boolean(input.programmeId) === Boolean(input.courseDefinitionId)) {
      throw new BadRequestException(
        "Award rule requires exactly one programme or course definition",
      );
    }
    const context = this.context.require();
    const id = randomUUID();
    return this.database.withTenantTransaction(context.tenantId, async (client) => {
      await this.requireInstitution(client, institutionId);
      const template = await client.query(
        `SELECT 1 FROM certificate_templates
         WHERE id=$1 AND institution_id=$2 AND status='approved'`,
        [input.templateId, institutionId],
      );
      if (!template.rowCount) {
        throw new BadRequestException(
          "Award rules require an approved certificate template in the same institution",
        );
      }
      if (input.programmeId) {
        const programme = await client.query(
          `SELECT 1 FROM programmes
           WHERE id=$1 AND institution_id=$2 AND status='active'`,
          [input.programmeId, institutionId],
        );
        if (!programme.rowCount) {
          throw new BadRequestException("Active programme was not found in this institution");
        }
      }
      if (input.courseDefinitionId) {
        const course = await client.query(
          `SELECT 1 FROM course_definitions
           WHERE id=$1 AND institution_id=$2 AND status='active'`,
          [input.courseDefinitionId, institutionId],
        );
        if (!course.rowCount) {
          throw new BadRequestException("Active course definition was not found in this institution");
        }
      }
      await client.query(
        `INSERT INTO certificate_award_rules (
          id,tenant_id,institution_id,template_id,programme_id,course_definition_id,
          rule_schema,status,version,created_by,updated_by
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',1,$8,$8)`,
        [
          id,
          context.tenantId,
          institutionId,
          input.templateId,
          input.programmeId ?? null,
          input.courseDefinitionId ?? null,
          input.ruleSchema,
          context.actorId,
        ],
      );
      await this.record(client, "credentials.award-rule.created", "certificate-award-rule", id, {
        institutionId,
        templateId: input.templateId,
        programmeId: input.programmeId,
        courseDefinitionId: input.courseDefinitionId,
        version: 1,
      });
      return { id, status: "active", version: 1 };
    });
  }

  private async requireInstitution(client: PoolClient, institutionId: string): Promise<void> {
    const result = await client.query(
      "SELECT 1 FROM institutions WHERE id=$1 AND status='active'",
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
