import { Module } from "@nestjs/common";
import { AccessAdministrationService } from "./application/access-administration.service.js";
import { AccessDirectoryQueryService } from "./application/access-directory-query.service.js";
import { MembershipInvitationService } from "./application/membership-invitation.service.js";
import { AccessDirectoryController } from "./http/access-directory.controller.js";
import { MembershipInvitationsController } from "./http/membership-invitations.controller.js";
import { PrincipalSessionController } from "./http/principal-session.controller.js";
import { WorkspaceSessionController } from "./http/workspace-session.controller.js";
import { IdentitySessionRepository } from "./infrastructure/identity-session.repository.js";
import { InvitationTokenService } from "./security/invitation-token.service.js";

@Module({
  controllers: [
    WorkspaceSessionController,
    PrincipalSessionController,
    MembershipInvitationsController,
    AccessDirectoryController,
  ],
  providers: [
    IdentitySessionRepository,
    InvitationTokenService,
    AccessDirectoryQueryService,
    AccessAdministrationService,
    MembershipInvitationService,
  ],
  exports: [
    IdentitySessionRepository,
    InvitationTokenService,
    AccessAdministrationService,
  ],
})
export class IdentityAccessModule {}
