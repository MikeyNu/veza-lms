import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
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
import {
  ActivateFormulaDto,
  AddAccommodationDto,
  AllocateMarkerDto,
  ApproveCertificateTemplateDto,
  ApproveRubricDto,
  AttachRubricDto,
  CompleteExportDto,
  CreateAssignmentDto,
  CreateAssignmentGroupDto,
  CreateAwardRuleDto,
  CreateCertificateTemplateDto,
  CreateFormulaVersionDto,
  CreateGradeCategoryDto,
  CreateGradeItemDto,
  CreateRubricDto,
  EvaluateAwardRuleDto,
  FinalizeSubmissionDto,
  IssueCertificateDto,
  OverrideGradeDto,
  PublishAssignmentDto,
  PublishGradeDto,
  RecordMarkDto,
  RecordScanDto,
  RegisterSubmissionFileDto,
  ReleaseMarkDto,
  RequestExportDto,
  RevokeCertificateDto,
  StartSubmissionDto,
  SubmitCertificateTemplateDto,
  SubmitRubricDto,
  UpdateAssignmentGroupMembersDto,
  UpdateUploadOffsetDto,
} from "../application/academic-evidence.dto.js";
import { AcademicEvidenceService } from "../application/academic-evidence.service.js";
import { AcademicGovernanceService } from "../application/academic-governance.service.js";
import { LearnerSubmissionService } from "../application/learner-submission.service.js";

@Controller("academic-evidence")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class AcademicEvidenceController {
  constructor(
    private readonly service: AcademicEvidenceService,
    private readonly governance: AcademicGovernanceService,
    private readonly learnerSubmissions: LearnerSubmissionService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Post("institutions/:institutionId/assignments")
  createAssignment(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateAssignmentDto,
  ) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.service.createAssignment(institutionId, input);
  }

  @Post("institutions/:institutionId/assignments/:assignmentId/publish")
  @UseGuards(MfaGuard)
  publishAssignment(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
    @Body() input: PublishAssignmentDto,
  ) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.service.publishAssignment(institutionId, assignmentId, input);
  }

  @Post("institutions/:institutionId/assignments/:assignmentId/accommodations")
  addAccommodation(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
    @Body() input: AddAccommodationDto,
  ) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.service.addAccommodation(institutionId, assignmentId, input);
  }

  @Post("institutions/:institutionId/rubrics")
  createRubric(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateRubricDto,
  ) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.governance.createRubric(institutionId, input);
  }

  @Post("institutions/:institutionId/rubrics/:rubricId/submit")
  submitRubric(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("rubricId", new ParseUUIDPipe()) rubricId: string,
    @Body() input: SubmitRubricDto,
  ) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.governance.submitRubric(institutionId, rubricId, input);
  }

  @Post("institutions/:institutionId/rubrics/:rubricId/approve")
  @UseGuards(MfaGuard)
  approveRubric(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("rubricId", new ParseUUIDPipe()) rubricId: string,
    @Body() input: ApproveRubricDto,
  ) {
    this.assert(request, permissions.assessmentModerate, institutionId);
    return this.governance.approveRubric(institutionId, rubricId, input);
  }

  @Post("institutions/:institutionId/assignments/:assignmentId/rubric")
  attachRubric(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
    @Body() input: AttachRubricDto,
  ) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.governance.attachRubric(institutionId, assignmentId, input);
  }

  @Post("institutions/:institutionId/assignments/:assignmentId/groups")
  createAssignmentGroup(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("assignmentId", new ParseUUIDPipe()) assignmentId: string,
    @Body() input: CreateAssignmentGroupDto,
  ) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.governance.createAssignmentGroup(institutionId, assignmentId, input);
  }

  @Post("institutions/:institutionId/assignment-groups/:groupId/members")
  updateAssignmentGroupMembers(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("groupId", new ParseUUIDPipe()) groupId: string,
    @Body() input: UpdateAssignmentGroupMembersDto,
  ) {
    this.assert(request, permissions.assignmentManage, institutionId);
    return this.governance.updateAssignmentGroupMembers(institutionId, groupId, input);
  }

  @Post("submissions")
  startSubmission(@Req() request: AuthenticatedRequest, @Body() input: StartSubmissionDto) {
    this.assertTenant(request, permissions.submissionCreate);
    return this.learnerSubmissions.startSubmission(input);
  }

  @Post("submissions/:attemptId/files")
  registerFile(
    @Req() request: AuthenticatedRequest,
    @Param("attemptId", new ParseUUIDPipe()) attemptId: string,
    @Body() input: RegisterSubmissionFileDto,
  ) {
    this.assertTenant(request, permissions.submissionCreate);
    return this.learnerSubmissions.registerFile(attemptId, input);
  }

  @Post("submission-files/:fileId/offset")
  updateUploadOffset(
    @Req() request: AuthenticatedRequest,
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
    @Body() input: UpdateUploadOffsetDto,
  ) {
    this.assertTenant(request, permissions.submissionCreate);
    return this.learnerSubmissions.updateUploadOffset(fileId, input);
  }

  @Post("submission-files/:fileId/scan")
  recordScan(
    @Req() request: AuthenticatedRequest,
    @Param("fileId", new ParseUUIDPipe()) fileId: string,
    @Body() input: RecordScanDto,
  ) {
    this.assertTenant(request, permissions.submissionGrade);
    return this.service.recordScan(fileId, input);
  }

  @Post("submissions/:attemptId/finalize")
  finalizeSubmission(
    @Req() request: AuthenticatedRequest,
    @Param("attemptId", new ParseUUIDPipe()) attemptId: string,
    @Body() input: FinalizeSubmissionDto,
  ) {
    this.assertTenant(request, permissions.submissionCreate);
    return this.learnerSubmissions.finalizeSubmission(attemptId, input);
  }

  @Post("submissions/:attemptId/markers")
  allocateMarker(
    @Req() request: AuthenticatedRequest,
    @Param("attemptId", new ParseUUIDPipe()) attemptId: string,
    @Body() input: AllocateMarkerDto,
  ) {
    this.assertTenant(request, permissions.submissionGrade);
    return this.service.allocateMarker(attemptId, input);
  }

  @Post("submissions/:attemptId/marks")
  recordMark(
    @Req() request: AuthenticatedRequest,
    @Param("attemptId", new ParseUUIDPipe()) attemptId: string,
    @Body() input: RecordMarkDto,
  ) {
    this.assertTenant(request, permissions.submissionGrade);
    return this.service.recordMark(attemptId, input);
  }

  @Post("marks/:markId/release")
  @UseGuards(MfaGuard)
  releaseMark(
    @Req() request: AuthenticatedRequest,
    @Param("markId", new ParseUUIDPipe()) markId: string,
    @Body() input: ReleaseMarkDto,
  ) {
    this.assertTenant(request, permissions.resultPublish);
    return this.governance.releaseMark(markId, input);
  }

  @Post("institutions/:institutionId/gradebook/categories")
  createCategory(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateGradeCategoryDto,
  ) {
    this.assert(request, permissions.gradebookManage, institutionId);
    return this.service.createCategory(institutionId, input);
  }

  @Post("institutions/:institutionId/gradebook/items")
  createGradeItem(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateGradeItemDto,
  ) {
    this.assert(request, permissions.gradebookManage, institutionId);
    return this.service.createGradeItem(institutionId, input);
  }

  @Get("gradebook/:courseRunId")
  gradebook(
    @Req() request: AuthenticatedRequest,
    @Param("courseRunId", new ParseUUIDPipe()) courseRunId: string,
  ) {
    this.assertTenant(request, permissions.gradebookRead);
    return this.service.gradebook(courseRunId);
  }

  @Post("gradebook/formulas")
  createFormula(@Req() request: AuthenticatedRequest, @Body() input: CreateFormulaVersionDto) {
    this.assertTenant(request, permissions.gradebookManage);
    return this.service.createFormulaVersion(input);
  }

  @Post("gradebook/formulas/:formulaId/activate")
  @UseGuards(MfaGuard)
  activateFormula(
    @Req() request: AuthenticatedRequest,
    @Param("formulaId", new ParseUUIDPipe()) formulaId: string,
    @Body() input: ActivateFormulaDto,
  ) {
    this.assertTenant(request, permissions.gradebookPublish);
    return this.service.activateFormula(formulaId, input);
  }

  @Post("gradebook/results/override")
  overrideGrade(@Req() request: AuthenticatedRequest, @Body() input: OverrideGradeDto) {
    this.assertTenant(request, permissions.gradebookManage);
    return this.service.overrideGrade(input);
  }

  @Post("gradebook/results/publish")
  @UseGuards(MfaGuard)
  publishGrade(@Req() request: AuthenticatedRequest, @Body() input: PublishGradeDto) {
    this.assertTenant(request, permissions.gradebookPublish);
    return this.service.publishGrade(input);
  }

  @Post("institutions/:institutionId/certificate-templates")
  createTemplate(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateCertificateTemplateDto,
  ) {
    this.assert(request, permissions.certificateManage, institutionId);
    return this.service.createCertificateTemplate(institutionId, input);
  }

  @Post("institutions/:institutionId/certificate-templates/:templateId/submit")
  submitTemplate(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Body() input: SubmitCertificateTemplateDto,
  ) {
    this.assert(request, permissions.certificateManage, institutionId);
    return this.governance.submitCertificateTemplate(institutionId, templateId, input);
  }

  @Post("institutions/:institutionId/certificate-templates/:templateId/approve")
  @UseGuards(MfaGuard)
  approveTemplate(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("templateId", new ParseUUIDPipe()) templateId: string,
    @Body() input: ApproveCertificateTemplateDto,
  ) {
    this.assert(request, permissions.certificateIssue, institutionId);
    return this.governance.approveCertificateTemplate(institutionId, templateId, input);
  }

  @Post("institutions/:institutionId/award-rules")
  createAwardRule(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateAwardRuleDto,
  ) {
    this.assert(request, permissions.certificateManage, institutionId);
    return this.service.createAwardRule(institutionId, input);
  }

  @Post("institutions/:institutionId/award-rules/:awardRuleId/evaluate")
  evaluateAwardRule(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("awardRuleId", new ParseUUIDPipe()) awardRuleId: string,
    @Body() input: EvaluateAwardRuleDto,
  ) {
    this.assert(request, permissions.certificateManage, institutionId);
    return this.governance.evaluateAwardRule(institutionId, awardRuleId, input);
  }

  @Post("institutions/:institutionId/certificates")
  @UseGuards(MfaGuard)
  issueCertificate(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: IssueCertificateDto,
  ) {
    this.assert(request, permissions.certificateIssue, institutionId);
    return this.governance.issueCertificate(institutionId, input);
  }

  @Post("certificates/:certificateId/revoke")
  @UseGuards(MfaGuard)
  revokeCertificate(
    @Req() request: AuthenticatedRequest,
    @Param("certificateId", new ParseUUIDPipe()) certificateId: string,
    @Body() input: RevokeCertificateDto,
  ) {
    this.assertTenant(request, permissions.certificateIssue);
    return this.service.revokeCertificate(certificateId, input);
  }

  @Get("certificates/verify/:verificationCode")
  verifyCertificate(@Param("verificationCode") verificationCode: string) {
    return this.service.verifyCertificate(verificationCode);
  }

  @Post("exports")
  requestExport(
    @Req() request: AuthenticatedRequest,
    @Query("institutionId") institutionId: string | undefined,
    @Body() input: RequestExportDto,
  ) {
    this.assertTenant(request, permissions.exportManage);
    return this.service.requestExport(institutionId, input);
  }

  @Post("exports/:exportId/complete")
  completeExport(
    @Req() request: AuthenticatedRequest,
    @Param("exportId", new ParseUUIDPipe()) exportId: string,
    @Body() input: CompleteExportDto,
  ) {
    this.assertTenant(request, permissions.exportManage);
    return this.service.completeExport(exportId, input);
  }

  @Get("analytics")
  metrics(@Req() request: AuthenticatedRequest, @Query("institutionId") institutionId?: string) {
    this.assertTenant(request, permissions.analyticsRead);
    return this.service.metrics(institutionId);
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

  private assertTenant(request: AuthenticatedRequest, permission: Permission): void {
    this.authorization.assertPermission(
      request,
      permission,
      this.authorization.buildTenantResource(),
    );
  }
}
