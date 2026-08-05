import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { MfaGuard } from "../authentication/mfa.guard.js";
import { PlatformOperatorGuard } from "../authentication/platform-operator.guard.js";
import {
  ApproveEventSchemaDto,
  CreateEventConsumerDto,
  CreateEventSchemaDto,
  CreateScheduledJobDto,
  ReplayEventDto,
  SubmitEventSchemaDto,
  UpdateConsumerStatusDto,
} from "./event-operations.dto.js";
import { EventOperationsService } from "./event-operations.service.js";

@Controller("control-plane/events")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class EventOperationsController {
  constructor(private readonly operations: EventOperationsService) {}

  @Get("overview")
  overview() {
    return this.operations.overview();
  }

  @Get("schemas")
  schemas() {
    return this.operations.schemas();
  }

  @Post("schemas")
  createSchema(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateEventSchemaDto,
  ) {
    return this.operations.createSchema(
      this.principal(request),
      input,
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Post("schemas/:schemaId/submit")
  submitSchema(
    @Req() request: AuthenticatedRequest,
    @Param("schemaId", new ParseUUIDPipe()) schemaId: string,
    @Body() input: SubmitEventSchemaDto,
  ) {
    return this.operations.submitSchema(
      this.principal(request),
      schemaId,
      input,
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Post("schemas/:schemaId/approve")
  @UseGuards(MfaGuard)
  approveSchema(
    @Req() request: AuthenticatedRequest,
    @Param("schemaId", new ParseUUIDPipe()) schemaId: string,
    @Body() input: ApproveEventSchemaDto,
  ) {
    return this.operations.approveSchema(
      this.principal(request),
      schemaId,
      input,
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Post("consumers")
  createConsumer(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateEventConsumerDto,
  ) {
    return this.operations.createConsumer(
      this.principal(request),
      input,
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Post("consumers/:consumerKey/status")
  @UseGuards(MfaGuard)
  updateConsumerStatus(
    @Req() request: AuthenticatedRequest,
    @Param("consumerKey") consumerKey: string,
    @Body() input: UpdateConsumerStatusDto,
  ) {
    return this.operations.updateConsumerStatus(
      this.principal(request),
      consumerKey,
      input,
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Post(":eventId/replay")
  @UseGuards(MfaGuard)
  replay(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe()) eventId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: ReplayEventDto,
  ) {
    return this.operations.replay(
      this.principal(request),
      eventId,
      input,
      idempotencyKey ?? "",
      request.correlationId ?? "missing-correlation-id",
    );
  }

  @Post("schedules")
  createSchedule(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateScheduledJobDto,
  ) {
    return this.operations.createScheduledJob(
      this.principal(request),
      input,
      request.correlationId ?? "missing-correlation-id",
    );
  }

  private principal(request: AuthenticatedRequest) {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return request.principal;
  }
}
