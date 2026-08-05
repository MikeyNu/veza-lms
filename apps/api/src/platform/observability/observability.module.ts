import { Global, Module } from "@nestjs/common";
import {
  ObservabilityControlController,
  PlatformHealthController,
} from "./observability.controller.js";
import { ObservabilityInterceptor } from "./observability.interceptor.js";
import { ObservabilityService } from "./observability.service.js";

@Global()
@Module({
  controllers: [PlatformHealthController, ObservabilityControlController],
  providers: [ObservabilityService, ObservabilityInterceptor],
  exports: [ObservabilityService, ObservabilityInterceptor],
})
export class ObservabilityModule {}
