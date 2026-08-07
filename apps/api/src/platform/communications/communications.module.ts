import { Global, Module } from "@nestjs/common";
import { CommunicationsControlController } from "./communications-control.controller.js";
import { CommunicationsProviderController } from "./communications-provider.controller.js";
import { CommunicationsRecipientController } from "./communications-recipient.controller.js";
import { CommunicationsController } from "./communications.controller.js";
import { CommunicationsRecipientService } from "./communications-recipient.service.js";
import { CommunicationsService } from "./communications.service.js";

@Global()
@Module({
  controllers: [
    CommunicationsController,
    CommunicationsRecipientController,
    CommunicationsProviderController,
    CommunicationsControlController,
  ],
  providers: [CommunicationsService, CommunicationsRecipientService],
  exports: [CommunicationsService, CommunicationsRecipientService],
})
export class CommunicationsModule {}
