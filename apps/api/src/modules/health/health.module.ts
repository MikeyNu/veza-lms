import { Controller, Get, Module } from "@nestjs/common";

interface HealthResponse {
  readonly status: "ok";
  readonly service: "veza-api";
  readonly timestamp: string;
}

@Controller("health")
class HealthController {
  @Get()
  check(): HealthResponse {
    return { status: "ok", service: "veza-api", timestamp: new Date().toISOString() };
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
