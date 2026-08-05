import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../../../platform/authentication/platform-operator.guard.js";
import { DeadLetterOperationsService } from "../application/dead-letter-operations.service.js";
import { ListDeadLetterEventsDto } from "../application/list-dead-letter-events.dto.js";
import { RequeueDeadLetterDto } from "../application/requeue-dead-letter.dto.js";

@Controller("control-plane/outbox-dead-letters")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ControlPlaneDeadLettersController {
  constructor(private readonly operations: DeadLetterOperationsService) {}

  @Get()
  list(@Query() input: ListDeadLetterEventsDto) {
    return this.operations.list(input);
  }

  @Post(":eventId/requeue")
  requeue(
    @Req() request: AuthenticatedRequest,
    @Param("eventId", new ParseUUIDPipe()) eventId: string,
    @Headers("idempotency-key") idempotencyKey: string | undefined,
    @Body() input: RequeueDeadLetterDto,
  ) {
    if (!request.principal) throw new Error("Authenticated principal was not resolved");
    return this.operations.requeue(
      request.principal,
      eventId,
      input.reason,
      idempotencyKey ?? "",
      request.correlationId ?? "missing-correlation-id",
    );
  }
}
