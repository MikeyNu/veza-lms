import { Body, Controller, Param, ParseUUIDPipe, Post, Req, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import type {
  CreateAwardRuleDto,
  CreateCertificateTemplateDto,
} from "../application/academic-evidence.dto.js";
import { CredentialDefinitionService } from "../application/credential-definition.service.js";

@Controller("academic-evidence/institutions/:institutionId/credential-definitions")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class CredentialDefinitionController {
  constructor(
    private readonly credentials: CredentialDefinitionService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Post("templates")
  createTemplate(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateCertificateTemplateDto,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.certificateManage,
      this.authorization.buildInstitutionResource(institutionId),
    );
    return this.credentials.createTemplate(institutionId, input);
  }

  @Post("award-rules")
  createAwardRule(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateAwardRuleDto,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.certificateManage,
      this.authorization.buildInstitutionResource(institutionId),
    );
    return this.credentials.createAwardRule(institutionId, input);
  }
}
