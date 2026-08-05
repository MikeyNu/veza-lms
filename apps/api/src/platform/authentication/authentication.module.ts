import { Global, Module } from "@nestjs/common";
import { AuthenticationGuard } from "./authentication.guard.js";
import { ExternalAuthenticationGuard } from "./external-authentication.guard.js";
import { PlatformOperatorGuard } from "./platform-operator.guard.js";
import { MfaGuard } from "./mfa.guard.js";
import { PrincipalVerifier } from "./principal-verifier.service.js";

@Global()
@Module({
  providers: [PrincipalVerifier, AuthenticationGuard, ExternalAuthenticationGuard, PlatformOperatorGuard, MfaGuard],
  exports: [PrincipalVerifier, AuthenticationGuard, ExternalAuthenticationGuard, PlatformOperatorGuard, MfaGuard],
})
export class AuthenticationModule {}
