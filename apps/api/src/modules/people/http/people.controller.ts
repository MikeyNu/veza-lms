import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from "@nestjs/common";
import { permissions } from "@veza/authz";
import { AuthenticationGuard } from "../../../platform/authentication/authentication.guard.js";
import { MfaGuard } from "../../../platform/authentication/mfa.guard.js";
import { RequiresTenantPermission } from "../../../platform/authorization/requires-tenant-permission.decorator.js";
import { TenantPermissionGuard } from "../../../platform/authorization/tenant-permission.guard.js";
import { TenantMembershipGuard } from "../../tenancy/tenant-membership.guard.js";
import { ChangeRelationshipStateDto, CommitPeopleImportDto, CreatePersonDto, CreateRelationshipDto, DuplicateDecisionDto, ListPeopleDto, MergePeopleDto, ReverseMergeDto, StagePeopleImportDto, UpdatePersonDto, UpsertLearnerProfileDto, UpsertStaffProfileDto } from "../application/people.dto.js";
import { PeopleIntegrityService } from "../application/people-integrity.service.js";
import { PeopleQueryService } from "../application/people-query.service.js";
import { PeopleService } from "../application/people.service.js";

@Controller("people")
@UseGuards(AuthenticationGuard, TenantMembershipGuard, TenantPermissionGuard)
export class PeopleController {
  constructor(private readonly people: PeopleService, private readonly integrity: PeopleIntegrityService, private readonly query: PeopleQueryService) {}
  @Get() @RequiresTenantPermission(permissions.peopleRead) list(@Query() input: ListPeopleDto) { return this.people.list(input); }
  @Get("duplicates") @RequiresTenantPermission(permissions.peopleMerge) duplicates(@Query("cursor") cursor?: string, @Query("limit") limit?: string, @Query("status") status?: string) { return this.integrity.listDuplicates({ cursor, limit: limit ? Number(limit) : undefined, status }); }
  @Get(":personId") @RequiresTenantPermission(permissions.peopleRead) detail(@Param("personId", new ParseUUIDPipe()) personId: string) { return this.query.detail(personId); }
  @Post() @RequiresTenantPermission(permissions.peopleCreate) create(@Body() input: CreatePersonDto) { return this.people.create(input); }
  @Put(":personId") @RequiresTenantPermission(permissions.peopleUpdate) update(@Param("personId", new ParseUUIDPipe()) personId: string, @Body() input: UpdatePersonDto) { return this.people.update(personId, input); }
  @Put(":personId/institutions/:institutionId/learner-profile") @RequiresTenantPermission(permissions.learnerManage) learner(@Param("personId", new ParseUUIDPipe()) personId: string, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Body() input: UpsertLearnerProfileDto) { return this.people.upsertLearner(personId, institutionId, input); }
  @Put(":personId/institutions/:institutionId/staff-profile") @RequiresTenantPermission(permissions.staffManage) staff(@Param("personId", new ParseUUIDPipe()) personId: string, @Param("institutionId", new ParseUUIDPipe()) institutionId: string, @Body() input: UpsertStaffProfileDto) { return this.integrity.upsertStaff(personId, institutionId, input); }
  @Post(":personId/relationships") @RequiresTenantPermission(permissions.relationshipManage) relationship(@Param("personId", new ParseUUIDPipe()) personId: string, @Body() input: CreateRelationshipDto) { return this.people.createRelationship(personId, null, input); }
  @Post("relationships/:relationshipId/verify") @RequiresTenantPermission(permissions.relationshipManage) verify(@Param("relationshipId", new ParseUUIDPipe()) relationshipId: string, @Body() input: ChangeRelationshipStateDto) { return this.integrity.verifyRelationship(relationshipId, input); }
  @Post("relationships/:relationshipId/revoke") @RequiresTenantPermission(permissions.relationshipManage) revoke(@Param("relationshipId", new ParseUUIDPipe()) relationshipId: string, @Body() input: ChangeRelationshipStateDto) { return this.integrity.revokeRelationship(relationshipId, input); }
  @Post("duplicates/:candidateId/decision") @RequiresTenantPermission(permissions.peopleMerge) decide(@Param("candidateId", new ParseUUIDPipe()) candidateId: string, @Body() input: DuplicateDecisionDto) { return this.integrity.decideDuplicate(candidateId, input); }
  @Post("merges") @RequiresTenantPermission(permissions.peopleMerge) @UseGuards(MfaGuard) merge(@Body() input: MergePeopleDto) { return this.integrity.merge(input); }
  @Post("merges/:mergeId/reverse") @RequiresTenantPermission(permissions.peopleMerge) @UseGuards(MfaGuard) reverse(@Param("mergeId", new ParseUUIDPipe()) mergeId: string, @Body() input: ReverseMergeDto) { return this.integrity.reverseMerge(mergeId, input); }
  @Post("imports/dry-run") @RequiresTenantPermission(permissions.peopleImportManage) dryRun(@Body() input: StagePeopleImportDto) { return this.people.stageImport(input); }
  @Post("imports/:importId/commit") @RequiresTenantPermission(permissions.peopleImportManage) @UseGuards(MfaGuard) commit(@Param("importId", new ParseUUIDPipe()) importId: string, @Body() input: CommitPeopleImportDto) { return this.people.commitImport(importId, input); }
}
