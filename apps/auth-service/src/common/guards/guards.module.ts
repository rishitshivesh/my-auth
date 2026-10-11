import { Module, Global } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Permission,
  Role,
  RolePermission,
  User,
  UserRole,
  Policy,
  Group,
  UserGroup,
  GroupPolicy,
  UserPolicy,
  RolePolicy,
} from "@repo/database";
import { DatabaseModule } from "@/core/database/database.module";
import { JwtAuthGuard } from "./jwt-auth-guard";
import { TenantBindingGuard } from "./tenant-binding.guard";
import { SessionGuard } from "./session.guard";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RolesGuard } from "@/modules/rbac/guards/roles.guard";
import { SentryProtectedGuard } from "@/common/guards/sentry-protected-route.guard";
import { RbacService } from "@/modules/rbac/services/rbac.service";
import { RoleService } from "@/modules/rbac/services/role.service";
import { PermissionService } from "@/modules/rbac/services/permission.service";
import { PolicyEvaluationService } from "@/modules/rbac/services/policy-evaluation.service";
import { RbacCacheService } from "@/modules/rbac/services/rbac-cache.service";
import { RedisService } from "@/common/service/redis.service";

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
    DatabaseModule,
    TypeOrmModule.forFeature([
      User,
      UserRole,
      Role,
      RolePermission,
      Permission,
      Policy,
      Group,
      UserGroup,
      GroupPolicy,
      UserPolicy,
      RolePolicy,
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
    PolicyEvaluationService,
    RbacCacheService,
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
    PolicyEvaluationService,
    RbacCacheService,
    RolePermission,
  ],
})
export class GuardsModule {}
