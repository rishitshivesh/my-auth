import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  User,
  Session,
  SecurityEvent,
  UserRole,
  Role,
  RolePermission,
  Permission,
} from "@repo/database";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { RbacService } from "@/modules/rbac/services/rbac.service";
import { RbacModule } from "@/modules/rbac/rbac.module";
import { RoleService } from "@/modules/rbac/services/role.service";
import { PermissionService } from "@/modules/rbac/services/permission.service";

/**
 * User Module
 *
 * Handles user management functionality:
 * - User profile management
 * - Password changes
 * - Session management
 * - Security event tracking
 * - Account deletion
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Session,
      SecurityEvent,
      UserRole,
      Role,
      RolePermission,
      UserRole,
      Permission,
    ]),
  ],
  controllers: [UserController],
  providers: [UserService, RbacService, RoleService, PermissionService],
  exports: [UserService],
})
export class UserModule {}
