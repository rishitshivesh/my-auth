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
import { JwtAuthGuard } from "@/common/guards";

@ApiTags("RBAC")
@Controller("rbac")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RbacController {
  constructor(
    private rbacService: RbacService,
    private roleService: RoleService,
    private permissionService: PermissionService,
  ) {}

  // ============================================================
  // PERMISSION ENDPOINTS
  // ============================================================

  @Get("permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("permissions:read")
  @ApiOperation({ summary: "List all permissions" })
  @ApiResponse({ status: 200, description: "Permissions retrieved" })
  async listPermissions(@Request() req: any) {
    const tenantId = req.tenantId!;
    return this.permissionService.listPermissions(tenantId);
  }

  @Post("permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("permissions:write")
  @ApiOperation({ summary: "Create permission" })
  @ApiResponse({ status: 201, description: "Permission created" })
  async createPermission(
    @Request() req: any,
    @Body() dto: CreatePermissionDto,
  ) {
    const tenantId = req.tenantId!;
    return this.permissionService.createPermission({
      tenantId,
      ...dto,
    });
  }

  @Get("permissions/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("permissions:read")
  @ApiOperation({ summary: "Get permission by ID" })
  async getPermission(@Request() req: any, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    return this.permissionService.getPermission(id, tenantId);
  }

  @Put("permissions/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("permissions:write")
  @ApiOperation({ summary: "Update permission" })
  async updatePermission(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdatePermissionDto,
  ) {
    const tenantId = req.tenantId!;
    return this.permissionService.updatePermission(id, tenantId, dto);
  }

  @Delete("permissions/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions("permissions:write")
  @ApiOperation({ summary: "Delete permission" })
  async deletePermission(@Request() req: any, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.permissionService.deletePermission(id, tenantId);
  }

  // ============================================================
  // ROLE ENDPOINTS
  // ============================================================

  @Get("roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("roles:read")
  @ApiOperation({ summary: "List all roles" })
  async listRoles(
    @Request() req: any,
    @Query("loadPermissions") loadPermissions?: string,
  ) {
    const tenantId = req.tenantId!;
    return this.roleService.listRoles(tenantId, {
      loadPermissions: loadPermissions === "true",
    });
  }

  @Post("roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("roles:write")
  @ApiOperation({ summary: "Create role" })
  async createRole(@Request() req: any, @Body() dto: CreateRoleDto) {
    const tenantId = req.tenantId!;
    const userId = req.user.sub;
    return this.roleService.createRole({
      tenantId,
      ...dto,
      createdBy: userId,
    });
  }

  @Get("roles/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("roles:read")
  @ApiOperation({ summary: "Get role by ID" })
  async getRole(
    @Request() req: any,
    @Param("id") id: string,
    @Query("loadPermissions") loadPermissions?: string,
  ) {
    const tenantId = req.tenantId!;
    return this.roleService.getRole(id, tenantId, loadPermissions === "true");
  }

  @Put("roles/:id")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("roles:write")
  @ApiOperation({ summary: "Update role" })
  async updateRole(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    const tenantId = req.tenantId!;
    return this.roleService.updateRole(id, tenantId, dto);
  }

  @Delete("roles/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(PermissionsGuard)
  @RequirePermissions("roles:write")
  @ApiOperation({ summary: "Delete role" })
  async deleteRole(@Request() req: any, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    await this.roleService.deleteRole(id, tenantId);
  }

  // ============================================================
  // ROLE-PERMISSION ENDPOINTS
  // ============================================================

  @Post("roles/:id/permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("roles:write")
  @ApiOperation({ summary: "Assign permissions to role" })
  async assignPermissionsToRole(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: AssignPermissionsDto,
  ) {
    const tenantId = req.tenantId!;
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
  @RequirePermissions("roles:write")
  @ApiOperation({ summary: "Remove permissions from role" })
  async removePermissionsFromRole(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: RemovePermissionsDto,
  ) {
    const tenantId = req.tenantId!;
    await this.roleService.removePermissionsFromRole(
      id,
      tenantId,
      dto.permissionNames,
    );
    return { message: "Permissions removed successfully" };
  }

  @Get("roles/:id/permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("roles:read")
  @ApiOperation({ summary: "Get role permissions" })
  async getRolePermissions(@Request() req: any, @Param("id") id: string) {
    const tenantId = req.tenantId!;
    return this.roleService.getRolePermissions(id, tenantId);
  }

  // ============================================================
  // USER-ROLE ENDPOINTS
  // ============================================================

  @Get("users/:userId/roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:read")
  @ApiOperation({ summary: "Get user roles" })
  async getUserRoles(@Request() req: any, @Param("userId") userId: string) {
    const tenantId = req.tenantId!;
    return this.rbacService.getUserRoles(userId, tenantId);
  }

  @Post("users/:userId/roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:write")
  @ApiOperation({ summary: "Assign roles to user" })
  async assignRolesToUser(
    @Request() req: any,
    @Param("userId") userId: string,
    @Body() dto: AssignRolesByNameDto,
  ) {
    const tenantId = req.tenantId!;
    const assignedBy = req.user.sub;

    await this.rbacService.assignRolesByNames({
      userId,
      tenantId,
      roleNames: dto.roleNames,
      assignedBy,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      reason: dto.reason,
    });

    return { message: "Roles assigned successfully" };
  }

  @Put("users/:userId/roles")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:write")
  @ApiOperation({ summary: "Set user roles (replace all)" })
  async setUserRoles(
    @Request() req: any,
    @Param("userId") userId: string,
    @Body() dto: SetUserRolesDto,
  ) {
    const tenantId = req.tenantId!;
    const assignedBy = req.user.sub;

    await this.rbacService.setUserRoles(
      userId,
      dto.roleNames,
      tenantId,
      assignedBy,
    );
    return { message: "User roles updated successfully" };
  }

  @Delete("users/:userId/roles/:roleName")
  @HttpCode(HttpStatus.OK)
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:write")
  @ApiOperation({ summary: "Remove role from user" })
  async removeRoleFromUser(
    @Request() req: any,
    @Param("userId") userId: string,
    @Param("roleName") roleName: string,
  ) {
    const tenantId = req.tenantId!;
    await this.rbacService.removeRoleByName(userId, roleName, tenantId);
    return { message: "Role removed successfully" };
  }

  @Get("users/:userId/permissions")
  @UseGuards(PermissionsGuard)
  @RequirePermissions("users:read")
  @ApiOperation({ summary: "Get user permissions (aggregated from all roles)" })
  async getUserPermissions(
    @Request() req: any,
    @Param("userId") userId: string,
  ) {
    const tenantId = req.tenantId!;
    return this.rbacService.getUserPermissions(userId, tenantId);
  }

  // ============================================================
  // PERMISSION CHECK ENDPOINTS
  // ============================================================

  @Post("users/:userId/check-permission")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Check if user has permission" })
  async checkPermission(
    @Request() req: any,
    @Param("userId") userId: string,
    @Body() dto: CheckPermissionDto,
  ) {
    const tenantId = req.tenantId!;
    const hasPermission = await this.rbacService.userHasPermission(
      userId,
      tenantId,
      dto.permission,
    );
    return { hasPermission };
  }

  @Post("users/:userId/check-role")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Check if user has role" })
  async checkRole(
    @Request() req: any,
    @Param("userId") userId: string,
    @Body() dto: CheckRoleDto,
  ) {
    const tenantId = req.tenantId!;
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
  async getMyRoles(@Request() req: any) {
    const tenantId = req.tenantId!;
    const userId = req.user.sub;
    return this.rbacService.getUserRoles(userId, tenantId);
  }

  @Get("me/permissions")
  @ApiOperation({ summary: "Get my permissions" })
  async getMyPermissions(@Request() req: any) {
    const tenantId = req.tenantId!;
    const userId = req.user.sub;
    return this.rbacService.getUserPermissions(userId, tenantId);
  }

  @Post("me/check-permission")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Check if I have permission" })
  async checkMyPermission(
    @Request() req: any,
    @Body() dto: CheckPermissionDto,
  ) {
    const tenantId = req.tenantId!;
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
  async initializeTenant(@Request() req: any) {
    const tenantId = req.tenantId!;
    const userId = req.user.sub;
    await this.rbacService.initializeTenant(tenantId, userId);
    return { message: "RBAC initialized successfully" };
  }

  @Post("cleanup-expired")
  @UseGuards(RolesGuard)
  @RequireAdmin()
  @ApiOperation({ summary: "Remove expired role assignments" })
  async cleanupExpiredRoles(@Request() req: any) {
    const tenantId = req.tenantId!;
    const count = await this.rbacService.cleanupExpiredRoles(tenantId);
    return { message: `Removed ${count} expired role assignments` };
  }
}
