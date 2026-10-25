import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { SecurityEventService } from "@/common/service/security-event.service";
import { SecurityEventType } from "@repo/database";
import { SessionGuard } from "@/common/guards/session.guard";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RolesGuard } from "./guards/roles.guard";
import {
  RequirePermissions,
  RequireRoles,
  RequireAdmin,
} from "./decorators/rbac.decorator";
import { RbacService } from "./services/rbac.service";
import { RoleService } from "./services/role.service";
import { PermissionService } from "./services/permission.service";
import { PolicyService } from "./services/policy.service";
import { GroupService } from "./services/group.service";
import { PolicyEvaluationService } from "./services/policy-evaluation.service";
import {
  CreatePermissionDto,
  UpdatePermissionDto,
  CreateRoleDto,
  UpdateRoleDto,
  AssignPermissionsDto,
  RemovePermissionsDto,
  AssignRoleDto,
  AssignRolesByNameDto,
  SetUserRolesDto,
  CheckPermissionDto,
  CheckRoleDto,
} from "./dto/rbac.dto";
import { CreatePolicyDto, UpdatePolicyDto, SimulatePolicyDto } from "./dto/policy.dto";
import { CreateGroupDto, UpdateGroupDto } from "./dto/group.dto";
import { JwtAuthGuard } from "@/common/guards";
import { Permissions } from "./constants/permissions.catalog";

interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; mfaVerified?: boolean };
  ip?: string;
  requestId?: string;
  get?(name: string): string | undefined;
}

@ApiTags("RBAC")
@Controller("rbac")
@UseGuards(JwtAuthGuard, SessionGuard)
@ApiBearerAuth()
export class RbacController {
  constructor(
    private rbacService: RbacService,
    private roleService: RoleService,
    private permissionService: PermissionService,
    private policyService: PolicyService,
    private groupService: GroupService,
    private policyEvaluationService: PolicyEvaluationService,
    private securityEvents: SecurityEventService,
  ) {}

  private audit(
    req: AuthenticatedRequest,
    eventType: (typeof SecurityEventType)[keyof typeof SecurityEventType],
    resourceType: string,
    resourceId: string,
    metadata: Record<string, unknown> = {},
  ): void {
    this.securityEvents.log({
      tenantId: req.tenantId,
      userId: req.user.sub,
      eventType,
      severity: "warning",
      ipAddress: req.ip ?? "0.0.0.0",
      userAgent: String(req.get?.("user-agent") ?? "unknown"),
      requestId: req.requestId,
      resourceType,
      resourceId,
      metadata,
    });
  }

  // ============================================================
  // PERMISSION ENDPOINTS
  // ============================================================

  @Get("permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.PERMISSIONS_READ)
  @ApiOperation({ summary: "List all permissions" })
  @ApiResponse({ status: 200, description: "Permissions retrieved" })
  async listPermissions(@Request() req: AuthenticatedRequest) {
    const tenantId = req.tenantId;
    return this.permissionService.listPermissions(tenantId);
  }

  @Post("permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.PERMISSIONS_WRITE)
  @ApiOperation({ summary: "Create permission" })
  @ApiResponse({ status: 201, description: "Permission created" })
  async createPermission(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CreatePermissionDto,
  ) {
    const tenantId = req.tenantId;
    return this.permissionService.createPermission({
      tenantId,
      ...dto,
    });
  }

  @Get("permissions/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.PERMISSIONS_READ)
  @ApiOperation({ summary: "Get permission by ID" })
  async getPermission(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId;
    return this.permissionService.getPermission(id, tenantId);
  }

  @Put("permissions/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.PERMISSIONS_WRITE)
  @ApiOperation({ summary: "Update permission" })
  async updatePermission(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    const tenantId = req.tenantId;
    return this.permissionService.updatePermission(id, tenantId, dto);
  }

  @Delete("permissions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.PERMISSIONS_WRITE)
  @ApiOperation({ summary: "Delete permission" })
  async deletePermission(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId;
    await this.permissionService.deletePermission(id, tenantId);
  }

  // ============================================================
  // ROLE ENDPOINTS
  // ============================================================

  @Get("roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_READ)
  @ApiOperation({ summary: "List all roles" })
  async listRoles(
    @Request() req: AuthenticatedRequest,
    @Query("loadPermissions") loadPermissions?: string,
  ) {
    const tenantId = req.tenantId;
    return this.roleService.listRoles(tenantId, {
      loadPermissions: loadPermissions === "true",
    });
  }

  @Post("roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_WRITE)
  @ApiOperation({ summary: "Create role" })
  async createRole(@Request() req: AuthenticatedRequest, @Body() dto: CreateRoleDto) {
    const tenantId = req.tenantId;
    const userId = req.user.sub;
    await this.rbacService.assertCanSetRolePriority(userId, tenantId, dto.priority ?? 0);
    const created = await this.roleService.createRole({
      tenantId,
      ...dto,
      createdBy: userId,
    });
    this.audit(req, SecurityEventType.ROLE_CREATED, "role", created.id, { name: created.name });
    return created;
  }

  @Get("roles/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_READ)
  @ApiOperation({ summary: "Get role by ID" })
  async getRole(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("loadPermissions") loadPermissions?: string,
  ) {
    const tenantId = req.tenantId;
    return this.roleService.getRole(id, tenantId, loadPermissions === "true");
  }

  @Put("roles/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_WRITE)
  @ApiOperation({ summary: "Update role" })
  async updateRole(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const tenantId = req.tenantId;
    await this.rbacService.assertCanSetRolePriority(req.user.sub, tenantId, dto.priority ?? 0);
    return this.roleService.updateRole(id, tenantId, dto);
  }

  @Delete("roles/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_WRITE)
  @ApiOperation({ summary: "Delete role" })
  async deleteRole(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId;
    await this.roleService.deleteRole(id, tenantId);
    this.audit(req, SecurityEventType.ROLE_DELETED, "role", id);
  }

  // ============================================================
  // ROLE-PERMISSION ENDPOINTS
  // ============================================================

  @Post("roles/:id/permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_WRITE)
  @ApiOperation({ summary: "Assign permissions to role" })
  async assignPermissionsToRole(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    const tenantId = req.tenantId;
    const userId = req.user.sub;
    await this.roleService.assignPermissionsToRole(
      id,
      tenantId,
      dto.permissionNames,
      userId,
    );
    return { message: "Permissions assigned successfully" };
  }

  @Delete("roles/:id/permissions")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_WRITE)
  @ApiOperation({ summary: "Remove permissions from role" })
  async removePermissionsFromRole(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RemovePermissionsDto,
  ) {
    const tenantId = req.tenantId;
    await this.roleService.removePermissionsFromRole(
      id,
      tenantId,
      dto.permissionNames,
    );
    return { message: "Permissions removed successfully" };
  }

  @Get("roles/:id/permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_READ)
  @ApiOperation({ summary: "Get role permissions" })
  async getRolePermissions(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    const tenantId = req.tenantId;
    return this.roleService.getRolePermissions(id, tenantId);
  }

  @Get("roles/:roleId/policies")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_READ)
  @ApiOperation({ summary: "List policies attached to a role" })
  async getRolePolicies(@Request() req: AuthenticatedRequest, @Param("roleId") roleId: string) {
    return this.policyService.listPoliciesForRole(roleId, req.tenantId);
  }

  // ============================================================
  // USER-ROLE ENDPOINTS
  // ============================================================

  @Get("users/:userId/roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: "Get user roles" })
  async getUserRoles(@Request() req: AuthenticatedRequest, @Param("userId") userId: string) {
    const tenantId = req.tenantId;
    return this.rbacService.getUserRoles(userId, tenantId);
  }

  @Post("users/:userId/roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Assign roles to user" })
  async assignRolesToUser(
    @Request() req: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Body() dto: AssignRolesByNameDto,
  ) {
    const tenantId = req.tenantId;
    const assignedBy = req.user.sub;

    await this.rbacService.assignRolesByNames({
      userId,
      tenantId,
      roleNames: dto.roleNames,
      assignedBy,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      reason: dto.reason,
    });
    this.audit(req, SecurityEventType.ROLE_ASSIGNED, "user", userId, { roles: dto.roleNames });

    return { message: "Roles assigned successfully" };
  }

  @Put("users/:userId/roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Set user roles (replace all)" })
  async setUserRoles(
    @Request() req: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Body() dto: SetUserRolesDto,
  ) {
    const tenantId = req.tenantId;
    const assignedBy = req.user.sub;

    await this.rbacService.setUserRoles(
      userId,
      dto.roleNames,
      tenantId,
      assignedBy,
    );
    this.audit(req, SecurityEventType.ROLE_ASSIGNED, "user", userId, { roles: dto.roleNames, mode: "replace" });
    return { message: "User roles updated successfully" };
  }

  @Delete("users/:userId/roles/:roleName")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_WRITE)
  @ApiOperation({ summary: "Remove role from user" })
  async removeRoleFromUser(
    @Request() req: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Param("roleName") roleName: string,
  ) {
    const tenantId = req.tenantId;
    await this.rbacService.removeRoleByName(
      userId,
      roleName,
      tenantId,
      req.user.sub,
    );
    this.audit(req, SecurityEventType.ROLE_REMOVED, "user", userId, { role: roleName });
    return { message: "Role removed successfully" };
  }

  @Get("users/:userId/permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: "Get user permissions (aggregated from all roles)" })
  async getUserPermissions(
    @Request() req: AuthenticatedRequest,
    @Param("userId") userId: string,
  ) {
    const tenantId = req.tenantId;
    return this.rbacService.getUserPermissions(userId, tenantId);
  }

  // ============================================================
  // PERMISSION CHECK ENDPOINTS
  // ============================================================

  @Post("users/:userId/check-permission")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: "Check if user has permission" })
  async checkPermission(
    @Request() req: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Body() dto: CheckPermissionDto,
  ) {
    const tenantId = req.tenantId;
    const hasPermission = await this.rbacService.userHasPermission(
      userId,
      tenantId,
      dto.permission,
    );
    return { hasPermission };
  }

  @Post("users/:userId/check-role")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.USERS_READ)
  @ApiOperation({ summary: "Check if user has role" })
  async checkRole(
    @Request() req: AuthenticatedRequest,
    @Param("userId") userId: string,
    @Body() dto: CheckRoleDto,
  ) {
    const tenantId = req.tenantId;
    const hasRole = await this.rbacService.userHasRole(
      userId,
      tenantId,
      dto.role,
    );
    return { hasRole };
  }

  // ============================================================
  // MY RBAC (CURRENT USER)
  // ============================================================

  @Get("me/roles")
  @ApiOperation({ summary: "Get my roles" })
  async getMyRoles(@Request() req: AuthenticatedRequest) {
    const tenantId = req.tenantId;
    const userId = req.user.sub;
    return this.rbacService.getUserRoles(userId, tenantId);
  }

  @Get("me/permissions")
  @ApiOperation({ summary: "Get my permissions" })
  async getMyPermissions(@Request() req: AuthenticatedRequest) {
    const tenantId = req.tenantId;
    const userId = req.user.sub;
    return this.rbacService.getUserPermissions(userId, tenantId);
  }

  @Post("me/check-permission")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Check if I have permission" })
  async checkMyPermission(
    @Request() req: AuthenticatedRequest,
    @Body() dto: CheckPermissionDto,
  ) {
    const tenantId = req.tenantId;
    const userId = req.user.sub;
    const hasPermission = await this.rbacService.userHasPermission(
      userId,
      tenantId,
      dto.permission,
    );
    return { hasPermission };
  }

  // ============================================================
  // ADMIN ENDPOINTS
  // ============================================================

  @Post("initialize")
  @UseGuards(RolesGuard)
  @RequireAdmin()
  @ApiOperation({
    summary: "Initialize RBAC for tenant (create default permissions & roles)",
  })
  async initializeTenant(@Request() req: AuthenticatedRequest) {
    const tenantId = req.tenantId;
    const userId = req.user.sub;
    await this.rbacService.initializeTenant(tenantId, userId);
    return { message: "RBAC initialized successfully" };
  }

  @Post("cleanup-expired")
  @UseGuards(RolesGuard)
  @RequireAdmin()
  @ApiOperation({ summary: "Remove expired role assignments" })
  async cleanupExpiredRoles(@Request() req: AuthenticatedRequest) {
    const tenantId = req.tenantId;
    const count = await this.rbacService.cleanupExpiredRoles(tenantId);
    return { message: `Removed ${count} expired role assignments` };
  }

  // ============================================================
  // POLICY ENDPOINTS
  // ============================================================

  @Post("policies")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.POLICIES_WRITE)
  @ApiOperation({ summary: "Create policy" })
  @ApiResponse({ status: 201, description: "Policy created" })
  async createPolicy(@Request() req: AuthenticatedRequest, @Body() dto: CreatePolicyDto) {
    return this.policyService.createPolicy(req.tenantId, dto);
  }

  @Get("policies")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.POLICIES_READ)
  @ApiOperation({ summary: "List policies" })
  async listPolicies(
    @Request() req: AuthenticatedRequest,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    const parsedPage = Math.max(1, page ? parseInt(page, 10) || 1 : 1);
    const parsedLimit = Math.min(100, Math.max(1, limit ? parseInt(limit, 10) || 50 : 50));
    return this.policyService.listPolicies(req.tenantId, parsedPage, parsedLimit);
  }

  @Get("policies/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.POLICIES_READ)
  @ApiOperation({ summary: "Get policy detail" })
  async getPolicy(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.policyService.getPolicy(id, req.tenantId);
  }

  @Put("policies/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.POLICIES_WRITE)
  @ApiOperation({ summary: "Update policy" })
  async updatePolicy(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdatePolicyDto,
  ) {
    return this.policyService.updatePolicy(id, req.tenantId, dto);
  }

  @Delete("policies/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.POLICIES_WRITE)
  @ApiOperation({ summary: "Delete policy" })
  async deletePolicy(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.policyService.deletePolicy(id, req.tenantId);
  }

  @Post("policies/simulate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.POLICIES_SIMULATE)
  @ApiOperation({ summary: "Simulate policy evaluation" })
  async simulatePolicy(@Request() req: AuthenticatedRequest, @Body() dto: SimulatePolicyDto) {
    return this.policyEvaluationService.simulate({
      userId: dto.userId,
      tenantId: req.tenantId,
      action: dto.action,
      resource: dto.resource,
      context: {
        ipAddress: dto.ipAddress ?? req.ip ?? '0.0.0.0',
        mfaVerified: dto.mfaVerified ?? false,
      },
    });
  }

  @Post("roles/:roleId/policies/:policyId")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_WRITE)
  @ApiOperation({ summary: "Attach policy to role" })
  async attachPolicyToRole(
    @Request() req: AuthenticatedRequest,
    @Param("roleId") roleId: string,
    @Param("policyId") policyId: string,
  ) {
    await this.policyService.attachPolicyToRole(roleId, policyId, req.tenantId);
    return { message: "Policy attached to role" };
  }

  @Delete("roles/:roleId/policies/:policyId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.ROLES_WRITE)
  @ApiOperation({ summary: "Detach policy from role" })
  async detachPolicyFromRole(
    @Request() req: AuthenticatedRequest,
    @Param("roleId") roleId: string,
    @Param("policyId") policyId: string,
  ) {
    await this.policyService.detachPolicyFromRole(roleId, policyId, req.tenantId);
    return { message: "Policy detached from role" };
  }

  // ============================================================
  // GROUP ENDPOINTS
  // ============================================================

  @Post("groups")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.GROUPS_WRITE)
  @ApiOperation({ summary: "Create group" })
  @ApiResponse({ status: 201, description: "Group created" })
  async createGroup(@Request() req: AuthenticatedRequest, @Body() dto: CreateGroupDto) {
    return this.groupService.createGroup(req.tenantId, dto);
  }

  @Get("groups")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.GROUPS_READ)
  @ApiOperation({ summary: "List groups (tree)" })
  async listGroups(@Request() req: AuthenticatedRequest) {
    return this.groupService.listGroups(req.tenantId);
  }

  @Get("groups/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.GROUPS_READ)
  @ApiOperation({ summary: "Get group detail with members and policies" })
  async getGroupDetail(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.groupService.getGroupDetail(id, req.tenantId);
  }

  @Put("groups/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.GROUPS_WRITE)
  @ApiOperation({ summary: "Update group" })
  async updateGroup(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateGroupDto,
  ) {
    return this.groupService.updateGroup(id, req.tenantId, dto);
  }

  @Delete("groups/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.GROUPS_WRITE)
  @ApiOperation({ summary: "Delete group" })
  async deleteGroup(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.groupService.deleteGroup(id, req.tenantId);
  }

  @Post("groups/:id/members/:userId")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.GROUPS_WRITE)
  @ApiOperation({ summary: "Add user to group" })
  async addGroupMember(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    await this.groupService.addMember(id, userId, req.tenantId, req.user.sub);
    return { message: "User added to group" };
  }

  @Delete("groups/:id/members/:userId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.GROUPS_WRITE)
  @ApiOperation({ summary: "Remove user from group" })
  async removeGroupMember(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    await this.groupService.removeMember(id, userId, req.tenantId);
    return { message: "User removed from group" };
  }

  @Post("groups/:id/policies/:policyId")
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.GROUPS_WRITE)
  @ApiOperation({ summary: "Attach policy to group" })
  async attachPolicyToGroup(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("policyId") policyId: string,
  ) {
    await this.groupService.attachPolicy(id, policyId, req.tenantId);
    return { message: "Policy attached to group" };
  }

  @Delete("groups/:id/policies/:policyId")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions(Permissions.GROUPS_WRITE)
  @ApiOperation({ summary: "Detach policy from group" })
  async detachPolicyFromGroup(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("policyId") policyId: string,
  ) {
    await this.groupService.detachPolicy(id, policyId, req.tenantId);
    return { message: "Policy detached from group" };
  }
}
