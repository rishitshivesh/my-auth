import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  Permission,
  Role,
  RolePermission,
  UserRole,
  User,
} from "@repo/database";
import { RbacController } from "./rbac.controller";
import { RbacService } from "./services/rbac.service";
import { RoleService } from "./services/role.service";
import { PermissionService } from "./services/permission.service";
import { PermissionsGuard } from "./guards/permissions.guard";
import { RolesGuard } from "./guards/roles.guard";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Permission,
      Role,
      RolePermission,
      UserRole,
      User,
    ]),
  ],
  controllers: [RbacController],
  providers: [
    RbacService,
    RoleService,
    PermissionService,
    PermissionsGuard,
    RolesGuard,
  ],
  exports: [
    RbacService,
    RoleService,
    PermissionService,
    PermissionsGuard,
    RolesGuard,
  ],
})
export class RbacModule {}
