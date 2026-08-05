import {
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
import {
  AnalyseCourseImportDto,
  CreateCourseSpaceDto,
  CreateReusableBlockDto,
  CreateStudioCommentDto,
  CreateStudioLessonDto,
  CreateStudioModuleDto,
  DecideStudioReviewDto,
  PublishCourseSpaceDto,
  RecordStudioAssetScanDto,
  RegisterStudioAssetDto,
  RequestStudioReviewDto,
  ResolveStudioCommentDto,
  SaveStudioRevisionDto,
} from "../application/studio.dto.js";
import { StudioLibraryService } from "../application/studio-library.service.js";
import { StudioService } from "../application/studio.service.js";

@Controller("institutions/:institutionId/studio")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class StudioController {
  constructor(
    private readonly studio: StudioService,
    private readonly library: StudioLibraryService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get()
  workspace(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
  ) {
    this.assert(request, permissions.studioRead, institutionId);
    return this.studio.workspace(institutionId);
  }

  @Get("library")
  studioLibrary(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
  ) {
    this.assert(request, permissions.studioRead, institutionId);
    return this.library.library(institutionId);
  }

  @Get("lessons/:lessonId")
  lesson(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
  ) {
    this.assert(request, permissions.studioRead, institutionId);
    return this.studio.lesson(institutionId, lessonId);
  }

  @Post("course-spaces")
  createCourseSpace(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateCourseSpaceDto,
  ) {
    this.assert(request, permissions.studioManage, institutionId);
    return this.studio.createCourseSpace(institutionId, input);
  }

  @Post("modules")
  createModule(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateStudioModuleDto,
  ) {
    this.assert(request, permissions.studioManage, institutionId);
    return this.studio.createModule(institutionId, input);
  }

  @Post("lessons")
  createLesson(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateStudioLessonDto,
  ) {
    this.assert(request, permissions.studioManage, institutionId);
    return this.studio.createLesson(institutionId, input);
  }

  @Put("lessons/:lessonId/revisions")
  saveRevision(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
    @Body() input: SaveStudioRevisionDto,
  ) {
    this.assert(request, permissions.studioManage, institutionId);
    return this.studio.saveRevision(institutionId, lessonId, input);
  }

  @Post("reusable-blocks")
  createReusableBlock(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: CreateReusableBlockDto,
  ) {
    this.assert(request, permissions.studioManage, institutionId);
    return this.studio.createReusableBlock(institutionId, input);
  }

  @Post("assets")
  registerAsset(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: RegisterStudioAssetDto,
  ) {
    this.assert(request, permissions.studioManage, institutionId);
    return this.library.registerAsset(institutionId, input);
  }

  @Post("assets/:assetId/scan")
  recordAssetScan(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("assetId", new ParseUUIDPipe()) assetId: string,
    @Body() input: RecordStudioAssetScanDto,
  ) {
    this.assert(request, permissions.studioManage, institutionId);
    return this.library.recordScan(institutionId, assetId, input);
  }

  @Post("lessons/:lessonId/comments")
  createComment(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
    @Body() input: CreateStudioCommentDto,
  ) {
    this.assert(request, permissions.studioRead, institutionId);
    return this.studio.createComment(institutionId, lessonId, input);
  }

  @Put("comments/:commentId/status")
  resolveComment(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("commentId", new ParseUUIDPipe()) commentId: string,
    @Body() input: ResolveStudioCommentDto,
  ) {
    this.assert(request, permissions.studioRead, institutionId);
    return this.studio.resolveComment(institutionId, commentId, input);
  }

  @Post("lessons/:lessonId/reviews")
  requestReview(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("lessonId", new ParseUUIDPipe()) lessonId: string,
    @Body() input: RequestStudioReviewDto,
  ) {
    this.assert(request, permissions.studioManage, institutionId);
    return this.studio.requestReview(institutionId, lessonId, input);
  }

  @Post("reviews/:reviewId/decision")
  @UseGuards(MfaGuard)
  decideReview(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("reviewId", new ParseUUIDPipe()) reviewId: string,
    @Body() input: DecideStudioReviewDto,
  ) {
    this.assert(request, permissions.studioReview, institutionId);
    return this.studio.decideReview(institutionId, reviewId, input);
  }

  @Post("course-spaces/:courseSpaceId/publish")
  @UseGuards(MfaGuard)
  publish(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Param("courseSpaceId", new ParseUUIDPipe()) courseSpaceId: string,
    @Body() input: PublishCourseSpaceDto,
  ) {
    this.assert(request, permissions.studioPublish, institutionId);
    return this.studio.publish(institutionId, courseSpaceId, input);
  }

  @Post("imports/analyse")
  analyseImport(
    @Req() request: AuthenticatedRequest,
    @Param("institutionId", new ParseUUIDPipe()) institutionId: string,
    @Body() input: AnalyseCourseImportDto,
  ) {
    this.assert(request, permissions.studioManage, institutionId);
    return this.studio.analyseImport(institutionId, input);
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
}
