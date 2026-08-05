import { Global, Module } from "@nestjs/common";
import {
  ObservabilityControlController,
  PlatformHealthController,
} from "./observability.controller.js";
import { ObservabilityInterceptor } from "./observability.interceptor.js";
import { ObservabilityOperationsService } from "./observability-operations.service.js";
import { ObservabilityService } from "./observability.service.js";

@Global()
@Module({
  controllers: [PlatformHealthController, ObservabilityControlController],
  providers: [ObservabilityService, ObservabilityOperationsService, ObservabilityInterceptor],
  exports: [ObservabilityService, ObservabilityOperationsService, ObservabilityInterceptor],
})
export class ObservabilityModule {}
