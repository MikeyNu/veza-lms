import { Global, Module } from "@nestjs/common";
import { CommunicationsControlController } from "./communications-control.controller.js";
import { CommunicationsProviderController } from "./communications-provider.controller.js";
import { CommunicationsController } from "./communications.controller.js";
import { CommunicationsService } from "./communications.service.js";

@Global()
@Module({
  controllers: [
    CommunicationsController,
    CommunicationsProviderController,
    CommunicationsControlController,
  ],
  providers: [CommunicationsService],
  exports: [CommunicationsService],
})
export class CommunicationsModule {}
