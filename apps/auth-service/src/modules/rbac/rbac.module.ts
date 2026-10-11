import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Permission,
  Role,
  RolePermission,
  UserRole,
  User,
  Policy,
  Group,
  UserGroup,
  GroupPolicy,
  UserPolicy,
  RolePolicy,
} from "@repo/database";
import { RbacController } from "./rbac.controller";
import { RbacService } from "./services/rbac.service";
import { RoleService } from "./services/role.service";
import { PermissionService } from "./services/permission.service";
import { PolicyService } from "./services/policy.service";
import { GroupService } from "./services/group.service";
import { PolicyEvaluationService } from "./services/policy-evaluation.service";
import { RbacCacheService } from "./services/rbac-cache.service";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RolesGuard } from "./guards/roles.guard";
import { RedisService } from "@/common/service/redis.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Permission,
      Role,
      RolePermission,
      UserRole,
      User,
      Policy,
      Group,
      UserGroup,
      GroupPolicy,
      UserPolicy,
      RolePolicy,
    ]),
  ],
  controllers: [RbacController],
  providers: [
    PolicyService,
    GroupService,
  ],
  // RbacService, RoleService, PermissionService, PolicyEvaluationService,
  // RbacCacheService and the RBAC guards are owned by the global GuardsModule
  // so that a single RbacCacheService instance backs every permission check.
  exports: [PolicyService, GroupService],
})
export class RbacModule {}
