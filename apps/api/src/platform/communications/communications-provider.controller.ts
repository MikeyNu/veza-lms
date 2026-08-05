import { Body, Controller, Headers, Post } from "@nestjs/common";
import { ProviderEventDto } from "./communications.dto.js";
import { CommunicationsService } from "./communications.service.js";

@Controller("internal/communications/providers")
export class CommunicationsProviderController {
  constructor(private readonly communications: CommunicationsService) {}

  @Post("events")
  providerEvent(
    @Headers("x-veza-timestamp") timestamp: string | undefined,
    @Headers("x-veza-signature") signature: string | undefined,
    @Body() input: ProviderEventDto,
  ) {
    return this.communications.applyProviderEvent(input, timestamp ?? "", signature ?? "");
  }
}
