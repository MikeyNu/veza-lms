import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthenticationGuard } from "../authentication/authentication.guard.js";
import { PlatformOperatorGuard } from "../authentication/platform-operator.guard.js";
import { CommunicationsService } from "./communications.service.js";

@Controller("control-plane/communications")
@UseGuards(AuthenticationGuard, PlatformOperatorGuard)
export class CommunicationsControlController {
  constructor(private readonly communications: CommunicationsService) {}

  @Get("diagnostics")
  diagnostics() {
    return this.communications.supportDiagnostics();
  }
}
