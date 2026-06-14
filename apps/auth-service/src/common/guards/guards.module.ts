import { Module, Global } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Permission,
  Role,
  RolePermission,
  Session,
  User,
  UserRole,
} from "@repo/database";
import { JwtAuthGuard } from "./jwt-auth-guard";
import { TenantBindingGuard } from "./tenant-binding.guard";
import { SessionGuard } from "./session.guard";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RolesGuard } from "@/modules/rbac/guards/roles.guard";
import { SentryProtectedGuard } from "@/common/guards/sentry-protected-route.guard";
import { RbacService } from "@/modules/rbac/services/rbac.service";
import { RoleService } from "@/modules/rbac/services/role.service";
import { PermissionService } from "@/modules/rbac/services/permission.service";

/**
 * GuardsModule
 *
 * Centralizes all authentication and authorization guards.
 * Marked as @Global so guards are available everywhere without importing.
 *
 * Guards included:
 * - JwtAuthGuard: JWT token validation
 * - TenantBindingGuard: Tenant isolation enforcement
 * - SessionGuard: Session validity checks
 * - PermissionsGuard: RBAC permission checks
 * - RolesGuard: RBAC role checks
 * - SentryProtectedGuard: Composite guard (all of the above)
 */
@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Session,
      User,
      UserRole,
      Role,
      RolePermission,
      Permission,
    ]),
  ],
  providers: [
    JwtAuthGuard,
    TenantBindingGuard,
    SessionGuard,
    PermissionsGuard,
    RolesGuard,
    SentryProtectedGuard,
    RbacService,
    RoleService,
    PermissionService,
    RolePermission,
  ],
  exports: [
    JwtAuthGuard,
    TenantBindingGuard,
    SessionGuard,
    PermissionsGuard,
    RolesGuard,
    SentryProtectedGuard,
    RbacService,
    RoleService,
    PermissionService,
    RolePermission,
  ],
})
export class GuardsModule {}
