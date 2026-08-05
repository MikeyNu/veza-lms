import { Global, Module } from "@nestjs/common";
import { ApiErrorFilter } from "./api-error.filter.js";
import { ApiGovernanceInterceptor } from "./api-governance.interceptor.js";
import { IdempotencyInterceptor } from "./idempotency.interceptor.js";
import {
  InternalOpenApiController,
  PublicOpenApiController,
} from "./openapi.controller.js";
import { OpenApiService } from "./openapi.service.js";
import {
  OAuthTokenController,
  ServiceAccountController,
} from "./service-account.controller.js";
import { ServiceAccountQueryService } from "./service-account-query.service.js";
import { ServiceAccountService } from "./service-account.service.js";

@Global()
@Module({
  controllers: [
    PublicOpenApiController,
    InternalOpenApiController,
    OAuthTokenController,
    ServiceAccountController,
  ],
  providers: [
    ApiErrorFilter,
    ApiGovernanceInterceptor,
    IdempotencyInterceptor,
    OpenApiService,
    ServiceAccountQueryService,
    ServiceAccountService,
  ],
  exports: [
    ApiErrorFilter,
    ApiGovernanceInterceptor,
    IdempotencyInterceptor,
    OpenApiService,
    ServiceAccountQueryService,
    ServiceAccountService,
  ],
})
export class ApiStandardsModule {}
