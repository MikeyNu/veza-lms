import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from "@nestjs/common";
import { permissions, type Permission } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import {
  ActivateFormulaDto,
  AddAccommodationDto,
  AllocateMarkerDto,
  CompleteExportDto,
  CreateAssignmentDto,
  CreateAwardRuleDto,
  CreateCertificateTemplateDto,
  CreateFormulaVersionDto,
  CreateGradeCategoryDto,
  CreateGradeItemDto,
  FinalizeSubmissionDto,
  IssueCertificateDto,
  OverrideGradeDto,
  PublishAssignmentDto,
  PublishGradeDto,
  RecordMarkDto,
  RecordScanDto,
  RegisterSubmissionFileDto,
  RequestExportDto,
  RevokeCertificateDto,
  StartSubmissionDto,
  UpdateUploadOffsetDto,
} from "../application/academic-evidence.dto.js";
import { AcademicEvidenceService } from "../application/academic-evidence.service.js";

@Controller("academic-evidence")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class AcademicEvidenceController {
  constructor(private readonly service: AcademicEvidenceService, private readonly authorization: TenantAuthorizationService) {}

  @Post("institutions/:institutionId/assignments")
  createAssignment(@Req() request: AuthenticatedRequest, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Body() input: CreateAssignmentDto) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.service.createAssignment(institutionId, input);
  }

  @Post("institutions/:institutionId/assignments/:assignmentId/publish")
  @UseGuards(MfaGuard)
  publishAssignment(@Req() request: AuthenticatedRequest, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string, @Body() input: PublishAssignmentDto) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.service.publishAssignment(institutionId, assignmentId, input);
  }

  @Post("institutions/:institutionId/assignments/:assignmentId/accommodations")
  addAccommodation(@Req() request: AuthenticatedRequest, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string, @Body() input: AddAccommodationDto) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.service.addAccommodation(institutionId, assignmentId, input);
  }

  @Post("submissions")
  startSubmission(@Body() input: StartSubmissionDto) { return this.service.startSubmission(input); }

  @Post("submissions/:attemptId/files")
  registerFile(@Param("attemptId", new ParseUUIDPipe()) attemptId: string, @Body() input: RegisterSubmissionFileDto) { return this.service.registerFile(attemptId, input); }

  @Post("submission-files/:fileId/offset")
  updateUploadOffset(@Param("fileId", new ParseUUIDPipe()) fileId: string, @Body() input: UpdateUploadOffsetDto) { return this.service.updateUploadOffset(fileId, input); }

  @Post("submission-files/:fileId/scan")
  recordScan(@Req() request: AuthenticatedRequest, @Param("fileId", new ParseUUIDPipe()) fileId: string, @Body() input: RecordScanDto) {
    this.authorization.assertPermission(request, permissions.submissionMark, this.authorization.buildTenantResource());
    return this.service.recordScan(fileId, input);
  }

  @Post("submissions/:attemptId/finalize")
  finalizeSubmission(@Param("attemptId", new ParseUUIDPipe()) attemptId: string, @Body() input: FinalizeSubmissionDto) { return this.service.finalizeSubmission(attemptId, input); }

  @Post("submissions/:attemptId/markers")
  allocateMarker(@Req() request: AuthenticatedRequest, @Param("attemptId", new ParseUUIDPipe()) attemptId: string, @Body() input: AllocateMarkerDto) {
    this.authorization.assertPermission(request, permissions.submissionMark, this.authorization.buildTenantResource());
    return this.service.allocateMarker(attemptId, input);
  }

  @Post("submissions/:attemptId/marks")
  recordMark(@Req() request: AuthenticatedRequest, @Param("attemptId", new ParseUUIDPipe()) attemptId: string, @Body() input: RecordMarkDto) {
    this.authorization.assertPermission(request, permissions.submissionMark, this.authorization.buildTenantResource());
    return this.service.recordMark(attemptId, input);
  }

  @Post("institutions/:institutionId/gradebook/categories")
  createCategory(@Req() request: AuthenticatedRequest, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Body() input: CreateGradeCategoryDto) {
    this.assert(request, permissions.gradebookManage, institutionId);
    return this.service.createCategory(institutionId, input);
  }

  @Post("institutions/:institutionId/gradebook/items")
  createGradeItem(@Req() request: AuthenticatedRequest, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Body() input: CreateGradeItemDto) {
    this.assert(request, permissions.gradebookManage, institutionId);
    return this.service.createGradeItem(institutionId, input);
  }

  @Get("gradebook/:courseRunId")
  gradebook(@Req() request: AuthenticatedRequest, @Param("courseRunId", new ParseUUIDPipe()) courseRunId: string) {
    this.authorization.assertPermission(request, permissions.gradebookRead, this.authorization.buildTenantResource());
    return this.service.gradebook(courseRunId);
  }

  @Post("gradebook/formulas")
  createFormula(@Req() request: AuthenticatedRequest, @Body() input: CreateFormulaVersionDto) {
    this.authorization.assertPermission(request, permissions.gradebookManage, this.authorization.buildTenantResource());
    return this.service.createFormulaVersion(input);
  }

  @Post("gradebook/formulas/:formulaId/activate")
  @UseGuards(MfaGuard)
  activateFormula(@Req() request: AuthenticatedRequest, @Param("formulaId", new ParseUUIDPipe()) formulaId: string, @Body() input: ActivateFormulaDto) {
    this.authorization.assertPermission(request, permissions.gradebookPublish, this.authorization.buildTenantResource());
    return this.service.activateFormula(formulaId, input);
  }

  @Post("gradebook/results/override")
  overrideGrade(@Req() request: AuthenticatedRequest, @Body() input: OverrideGradeDto) {
    this.authorization.assertPermission(request, permissions.gradebookManage, this.authorization.buildTenantResource());
    return this.service.overrideGrade(input);
  }

  @Post("gradebook/results/publish")
  @UseGuards(MfaGuard)
  publishGrade(@Req() request: AuthenticatedRequest, @Body() input: PublishGradeDto) {
    this.authorization.assertPermission(request, permissions.gradebookPublish, this.authorization.buildTenantResource());
    return this.service.publishGrade(input);
  }

  @Post("institutions/:institutionId/certificate-templates")
  createTemplate(@Req() request: AuthenticatedRequest, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Body() input: CreateCertificateTemplateDto) {
    this.assert(request, permissions.certificateManage, institutionId);
    return this.service.createCertificateTemplate(institutionId, input);
  }

  @Post("institutions/:institutionId/award-rules")
  createAwardRule(@Req() request: AuthenticatedRequest, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Body() input: CreateAwardRuleDto) {
    this.assert(request, permissions.certificateManage, institutionId);
    return this.service.createAwardRule(institutionId, input);
  }

  @Post("institutions/:institutionId/certificates")
  @UseGuards(MfaGuard)
  issueCertificate(@Req() request: AuthenticatedRequest, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Body() input: IssueCertificateDto) {
    this.assert(request, permissions.certificateIssue, institutionId);
    return this.service.issueCertificate(institutionId, input);
  }

  @Post("certificates/:certificateId/revoke")
  @UseGuards(MfaGuard)
  revokeCertificate(@Req() request: AuthenticatedRequest, @Param("certificateId", new ParseUUIDPipe()) certificateId: string, @Body() input: RevokeCertificateDto) {
    this.authorization.assertPermission(request, permissions.certificateIssue, this.authorization.buildTenantResource());
    return this.service.revokeCertificate(certificateId, input);
  }

  @Get("certificates/verify/:verificationCode")
  verifyCertificate(@Param("verificationCode") verificationCode: string) { return this.service.verifyCertificate(verificationCode); }

  @Post("exports")
  requestExport(@Req() request: AuthenticatedRequest, @Query("institutionId") institutionId: string | undefined, @Body() input: RequestExportDto) {
    this.authorization.assertPermission(request, permissions.exportManage, this.authorization.buildTenantResource());
    return this.service.requestExport(institutionId, input);
  }

  @Post("exports/:exportId/complete")
  completeExport(@Req() request: AuthenticatedRequest, @Param("exportId", new ParseUUIDPipe()) exportId: string, @Body() input: CompleteExportDto) {
    this.authorization.assertPermission(request, permissions.exportManage, this.authorization.buildTenantResource());
    return this.service.completeExport(exportId, input);
  }

  @Get("analytics")
  metrics(@Req() request: AuthenticatedRequest, @Query("institutionId") institutionId?: string) {
    this.authorization.assertPermission(request, permissions.analyticsRead, this.authorization.buildTenantResource());
    return this.service.metrics(institutionId);
  }

  private assert(request: AuthenticatedRequest, permission: Permission, institutionId: string): void {
    this.authorization.assertPermission(request, permission, this.authorization.buildInstitutionResource(institutionId));
  }
}
