import { Controller, Get, Header, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../authentication/platform-operator.guard.js";
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
  constructor(private readonly observability: ObservabilityService) {}

  @Get("overview")
  overview() {
    return this.observability.operationsOverview();
  }
}
