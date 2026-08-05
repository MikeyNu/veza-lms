import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { RequireTenantPermission } from "../../../platform/authorization/require-tenant-permission.decorator.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import {
  ApplyLearnerSyncOperationDto,
  CreateBookmarkDto,
  CreateDiscussionPostDto,
  CreateOfflineManifestDto,
  RecordCompletionEvidenceDto,
} from "../application/learner-course.dto.js";
import { LearnerCourseService } from "../application/learner-course.service.js";

@Controller("learner")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
@RequireTenantPermission(permissions.learnerCourseRead)
export class LearnerCourseController {
  constructor(private readonly learnerCourse: LearnerCourseService) {}

  @Get("home")
  home(@Req() _request: AuthenticatedRequest) {
    return this.learnerCourse.home();
  }

  @Get("enrolments/:enrolmentId/course-room")
  courseRoom(
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
    @Query("lowBandwidth", new ParseBoolPipe({ optional: true })) lowBandwidth?: boolean,
  ) {
    return this.learnerCourse.courseRoom(enrolmentId, lowBandwidth ?? false);
  }

  @Post("enrolments/:enrolmentId/evidence")
  recordEvidence(
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
    @Body() input: RecordCompletionEvidenceDto,
  ) {
    return this.learnerCourse.recordEvidence(enrolmentId, input);
  }

  @Post("enrolments/:enrolmentId/bookmarks")
  createBookmark(
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
    @Body() input: CreateBookmarkDto,
  ) {
    return this.learnerCourse.createBookmark(enrolmentId, input);
  }

  @Post("enrolments/:enrolmentId/discussion-posts")
  createDiscussionPost(
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
    @Body() input: CreateDiscussionPostDto,
  ) {
    return this.learnerCourse.createDiscussionPost(enrolmentId, input);
  }

  @Post("enrolments/:enrolmentId/offline-manifest")
  createOfflineManifest(
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
    @Body() input: CreateOfflineManifestDto,
  ) {
    return this.learnerCourse.createOfflineManifest(enrolmentId, input);
  }

  @Post("enrolments/:enrolmentId/sync")
  applySyncOperation(
    @Param("enrolmentId", new ParseUUIDPipe()) enrolmentId: string,
    @Body() input: ApplyLearnerSyncOperationDto,
  ) {
    return this.learnerCourse.applySyncOperation(enrolmentId, input);
  }
}
