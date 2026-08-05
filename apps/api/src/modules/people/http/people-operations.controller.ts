import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { permissions, type Permission } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { PeopleIdentityLinkService } from "../application/people-identity-link.service.js";
import { PeopleInstitutionBoundaryService } from "../application/people-institution-boundary.service.js";
import {
  CreateDataSubjectRequestDto,
  CreateDisclosureRestrictionDto,
  CreateOrganisationalAssignmentDto,
  CreatePersonAddressDto,
  CreatePersonConsentDto,
  CreatePersonContactPointDto,
  CreatePersonIdentifierDto,
  CreateStaffEngagementDto,
  EndStaffEngagementDto,
  InvitePersonIdentityDto,
  InviteRelatedPersonDto,
  LinkExistingIdentityDto,
  ReconcilePeopleImportRowDto,
  ResolvePeopleImportDuplicateDto,
} from "../application/people-operations.dto.js";
import { PeopleOperationsService } from "../application/people-operations.service.js";

@Controller("people/institutions/:institutionId")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class PeopleOperationsController {
  constructor(
    private readonly operations: PeopleOperationsService,
    private readonly identityLinks: PeopleIdentityLinkService,
    private readonly boundary: PeopleInstitutionBoundaryService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Post("persons/:personId/contacts")
  async createContact(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: CreatePersonContactPointDto,
  ) {
    this.assert(request, permissions.peopleUpdate, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    return this.operations.createContact(personId, input);
  }

  @Post("persons/:personId/addresses")
  async createAddress(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: CreatePersonAddressDto,
  ) {
    this.assert(request, permissions.peopleSensitiveManage, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    return this.operations.createAddress(personId, input);
  }

  @Post("persons/:personId/identifiers")
  async createIdentifier(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: CreatePersonIdentifierDto,
  ) {
    this.assert(request, permissions.peopleSensitiveManage, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    if (input.institutionId && input.institutionId !== institutionId) {
      throw new BadRequestException("Identifier institution must match the authorised route");
    }
    return this.operations.createIdentifier(personId, { ...input, institutionId });
  }

  @Post("persons/:personId/organisational-assignments")
  async createAssignment(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: CreateOrganisationalAssignmentDto,
  ) {
    this.assert(request, permissions.staffManage, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    this.requireMatchingInstitution(input.institutionId, institutionId);
    return this.operations.createAssignment(personId, input);
  }

  @Post("persons/:personId/staff-engagements")
  async createStaffEngagement(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: CreateStaffEngagementDto,
  ) {
    this.assert(request, permissions.staffManage, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    this.requireMatchingInstitution(input.institutionId, institutionId);
    return this.operations.createStaffEngagement(personId, input);
  }

  @Post("staff-engagements/:engagementId/end")
  async endStaffEngagement(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("engagementId", new ParseUUIDPipe()) engagementId: string,
    @Body() input: EndStaffEngagementDto,
  ) {
    this.assert(request, permissions.staffManage, institutionId);
    await this.boundary.assertStaffEngagementInInstitution(engagementId, institutionId);
    return this.operations.endStaffEngagement(engagementId, input);
  }

  @Post("persons/:personId/consents")
  async createConsent(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: CreatePersonConsentDto,
  ) {
    this.assert(request, permissions.peopleSensitiveManage, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    return this.operations.createConsent(personId, input);
  }

  @Post("persons/:personId/disclosure-restrictions")
  async createRestriction(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: CreateDisclosureRestrictionDto,
  ) {
    this.assert(request, permissions.peopleSensitiveManage, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    return this.operations.createRestriction(personId, input);
  }

  @Post("persons/:personId/identity-invitations")
  @UseGuards(MfaGuard)
  async inviteIdentity(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: InvitePersonIdentityDto,
  ) {
    this.assert(request, permissions.peopleIdentityLink, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    return this.operations.inviteIdentity(request, personId, institutionId, input);
  }

  @Post("persons/:personId/identity-links")
  @UseGuards(MfaGuard)
  async linkExistingIdentity(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: LinkExistingIdentityDto,
  ) {
    this.assert(request, permissions.peopleIdentityLink, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    return this.identityLinks.linkExisting(personId, institutionId, input);
  }

  @Post("persons/:personId/relationship-invitations")
  @UseGuards(MfaGuard)
  async inviteRelatedPerson(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: InviteRelatedPersonDto,
  ) {
    this.assert(request, permissions.relationshipManage, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    return this.operations.inviteRelatedPerson(request, personId, institutionId, input);
  }

  @Get("imports/:importId/rows")
  async listImportRows(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("importId", new ParseUUIDPipe()) importId: string,
  ) {
    this.assert(request, permissions.peopleImportManage, institutionId);
    await this.boundary.assertImportInInstitution(importId, institutionId);
    return this.operations.listImportRows(importId);
  }

  @Put("imports/:importId/rows/:rowId")
  async reconcileImportRow(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("importId", new ParseUUIDPipe()) importId: string,
    @Param("rowId", new ParseUUIDPipe()) rowId: string,
    @Body() input: ReconcilePeopleImportRowDto,
  ) {
    this.assert(request, permissions.peopleImportManage, institutionId);
    await this.boundary.assertImportInInstitution(importId, institutionId);
    return this.operations.reconcileImportRow(importId, rowId, input);
  }

  @Post("imports/:importId/rows/:rowId/duplicate-resolution")
  async resolveImportDuplicate(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("importId", new ParseUUIDPipe()) importId: string,
    @Param("rowId", new ParseUUIDPipe()) rowId: string,
    @Body() input: ResolvePeopleImportDuplicateDto,
  ) {
    this.assert(request, permissions.peopleImportManage, institutionId);
    await this.boundary.assertImportInInstitution(importId, institutionId);
    return this.operations.resolveImportDuplicate(importId, rowId, input);
  }

  @Post("persons/:personId/data-subject-requests")
  @UseGuards(MfaGuard)
  async createDataSubjectRequest(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Body() input: CreateDataSubjectRequestDto,
  ) {
    this.assert(request, permissions.peopleExport, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    return this.operations.createDataSubjectRequest(personId, input);
  }

  @Get("persons/:personId/data-subject-requests/:requestId")
  async getDataSubjectRequest(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("personId", new ParseUUIDPipe()) personId: string,
    @Param("requestId", new ParseUUIDPipe()) requestId: string,
  ) {
    this.assert(request, permissions.peopleExport, institutionId);
    await this.boundary.assertPersonInInstitution(personId, institutionId);
    return this.operations.getDataSubjectRequest(personId, requestId);
  }

  private assert(
    request: AuthenticatedRequest,
    permission: Permission,
    institutionId: string,
  ): void {
    this.authorization.assertPermission(
      request,
      permission,
      this.authorization.buildInstitutionResource(institutionId),
    );
  }

  private requireMatchingInstitution(inputInstitutionId: string, routeInstitutionId: string): void {
    if (inputInstitutionId !== routeInstitutionId) {
      throw new BadRequestException("Institution identifier must match the authorised route");
    }
  }
}
