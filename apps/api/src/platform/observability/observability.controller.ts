import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { FastifyReply } from "fastify";
import type { AuthenticatedRequest } from "../authentication/authenticated-request.js";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../authentication/platform-operator.guard.js";
import {
  CreateAlertRuleDto,
  CreateSloDefinitionDto,
  UpdateAlertEventStateDto,
  UpdateAlertRuleStatusDto,
  UpdateErrorReportStateDto,
  UpdateRuntimeStatusDto,
  UpdateSloStatusDto,
} from "./observability-operations.dto.js";
import { ObservabilityOperationsService } from "./observability-operations.service.js";
import { ObservabilityService } from "./observability.service.js";

@Controller("health")
export class PlatformHealthController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get("live")
  liveness() {
    return this.observability.liveness();
  }

  @Get("ready")
  async readiness(@Res({ passthrough: true }) reply: FastifyReply) {
    const result = await this.observability.readiness();
    reply.status(result.ready ? 200 : 503);
    reply.header("cache-control", "no-store");
    return result;
  }

  @Get("metrics")
  @Header("content-type", "text/plain; version=0.0.4; charset=utf-8")
  metrics() {
    return this.observability.prometheus();
  }
}

@Controller("control-plane/observability")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class ObservabilityControlController {
  constructor(private readonly operations: ObservabilityOperationsService) {}

  @Get("overview")
  overview() {
    return this.operations.overview();
  }

  @Post("slos")
  createSlo(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateSloDefinitionDto,
  ) {
    return this.operations.createSlo(input, this.actor(request));
  }

  @Post("slos/:id/status")
  updateSloStatus(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateSloStatusDto,
  ) {
    return this.operations.updateSloStatus(id, input, this.actor(request));
  }

  @Post("alert-rules")
  createAlertRule(
    @Req() request: AuthenticatedRequest,
    @Body() input: CreateAlertRuleDto,
  ) {
    return this.operations.createAlertRule(input, this.actor(request));
  }

  @Post("alert-rules/:id/status")
  updateAlertRuleStatus(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateAlertRuleStatusDto,
  ) {
    return this.operations.updateAlertRuleStatus(id, input, this.actor(request));
  }

  @Post("alerts/:id/state")
  updateAlertEvent(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateAlertEventStateDto,
  ) {
    return this.operations.updateAlertEvent(id, input, this.actor(request));
  }

  @Post("errors/:id/state")
  updateErrorReport(
    @Req() request: AuthenticatedRequest,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body() input: UpdateErrorReportStateDto,
  ) {
    return this.operations.updateErrorReport(id, input, this.actor(request));
  }

  @Post("runtimes/:runtimeKey/status")
  updateRuntime(
    @Req() request: AuthenticatedRequest,
    @Param("runtimeKey") runtimeKey: string,
    @Body() input: UpdateRuntimeStatusDto,
  ) {
    if (!/^[a-z][a-z0-9.-]{2,119}$/.test(runtimeKey)) {
      throw new BadRequestException("Runtime key is invalid");
    }
    return this.operations.updateRuntime(runtimeKey, input, this.actor(request));
  }

  private actor(request: AuthenticatedRequest) {
    if (!request.principal) throw new Error("Authenticated operator was not resolved");
    return {
      actorId: request.principal.userId,
      correlationId: request.correlationId ?? "missing-correlation-id",
    };
  }
}
