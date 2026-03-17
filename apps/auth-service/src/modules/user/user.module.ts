import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  User,
  Session,
  UserRole,
  Role,
  RolePermission,
  Permission,
  SecurityEvent,
} from "@repo/database";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { RbacService } from "@/modules/rbac/services/rbac.service";
import { RbacModule } from "@/modules/rbac/rbac.module";
import { RoleService } from "@/modules/rbac/services/role.service";
import { PermissionService } from "@/modules/rbac/services/permission.service";
import { SecurityEventModule } from "@/common/service/security-event.module";
import { SecurityEventService } from "@/common/service/security-event.service";

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
      UserRole,
      Role,
      RolePermission,
      UserRole,
      Permission,
      SecurityEvent,
    ]),
    SecurityEventModule,
  ],
  controllers: [UserController],
  providers: [
    UserService,
    SecurityEventService,
    RbacService,
    RoleService,
    PermissionService,
  ],
  exports: [UserService],
})
export class UserModule {}
