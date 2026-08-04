import { Module } from "@nestjs/common";
import { MembershipInvitationService } from "./application/membership-invitation.service.js";
import { MembershipInvitationsController } from "./http/membership-invitations.controller.js";
import { WorkspaceSessionController } from "./http/workspace-session.controller.js";
import { IdentitySessionRepository } from "./infrastructure/identity-session.repository.js";
import { InvitationTokenService } from "./security/invitation-token.service.js";

@Module({
  controllers: [WorkspaceSessionController, MembershipInvitationsController],
  providers: [
    IdentitySessionRepository,
    InvitationTokenService,
    MembershipInvitationService,
  ],
  exports: [IdentitySessionRepository, InvitationTokenService],
})
export class IdentityAccessModule {}
