import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Req,
  Res,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { permissions } from "@veza/authz";
import type { AuthenticatedRequest } from "../../../platform/authentication/authenticated-request.js";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { TenantAuthorizationService } from "../../../platform/authorization/tenant-authorization.service.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { AcademicExportService } from "../application/academic-export.service.js";

interface PassthroughReply {
  header(name: string, value: string): unknown;
}

@Controller("academic-evidence/exports")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class AcademicExportController {
  constructor(
    private readonly exports: AcademicExportService,
    private readonly authorization: TenantAuthorizationService,
  ) {}

  @Get(":exportId")
  status(
    @Req() request: AuthenticatedRequest,
    @Param("exportId", new ParseUUIDPipe()) exportId: string,
  ) {
    this.authorization.assertPermission(
      request,
      permissions.exportManage,
      this.authorization.buildTenantResource(),
    );
    return this.exports.status(exportId);
  }

  @Get(":exportId/download")
  async download(
    @Req() request: AuthenticatedRequest,
    @Param("exportId", new ParseUUIDPipe()) exportId: string,
    @Res({ passthrough: true }) response: PassthroughReply,
  ): Promise<StreamableFile> {
    this.authorization.assertPermission(
      request,
      permissions.exportManage,
      this.authorization.buildTenantResource(),
    );
    const document = await this.exports.download(exportId);
    response.header("content-type", document.mediaType);
    response.header(
      "content-disposition",
      `attachment; filename="${document.fileName}"`,
    );
    response.header("content-length", String(document.bytes.length));
    response.header("x-veza-checksum-sha256", document.checksum);
    response.header("cache-control", "private, no-store");
    response.header("x-content-type-options", "nosniff");
    return new StreamableFile(document.bytes);
  }
}
