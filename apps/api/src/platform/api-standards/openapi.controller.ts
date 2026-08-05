import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../authentication/platform-operator.guard.js";
import { OpenApiService } from "./openapi.service.js";

@Controller()
export class PublicOpenApiController {
  constructor(private readonly openApi: OpenApiService) {}

  @Get("openapi.json")
  document() {
    return this.openApi.document("public");
  }
}

@Controller("internal")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class InternalOpenApiController {
  constructor(private readonly openApi: OpenApiService) {}

  @Get("openapi.json")
  document() {
    return this.openApi.document("internal");
  }
}
