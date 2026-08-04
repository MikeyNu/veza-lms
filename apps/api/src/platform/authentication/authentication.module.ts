import { Global, Module } from "@nestjs/common";
import { AuthenticationGuard } from "./authentication.guard.js";
import { ExternalAuthenticationGuard } from "./external-authentication.guard.js";
import { PlatformOperatorGuard } from "./platform-operator.guard.js";
import { PrincipalVerifier } from "./principal-verifier.service.js";

@Global()
@Module({
  providers: [PrincipalVerifier, AuthenticationGuard, ExternalAuthenticationGuard, PlatformOperatorGuard],
  exports: [PrincipalVerifier, AuthenticationGuard, ExternalAuthenticationGuard, PlatformOperatorGuard],
})
export class AuthenticationModule {}
