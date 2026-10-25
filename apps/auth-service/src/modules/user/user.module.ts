import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import {
  User,
  Tenant,
  UserRole,
  Role,
  RolePermission,
  Permission,
  SecurityEvent,
  UserInvite,
} from "@repo/database";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";
import { UserRepository } from "./user.repository";
import { RbacService } from "@/modules/rbac/services/rbac.service";
import { RoleService } from "@/modules/rbac/services/role.service";
import { PermissionService } from "@/modules/rbac/services/permission.service";
import { SecurityEventModule } from "@/common/service/security-event.module";
import { SecurityEventService } from "@/common/service/security-event.service";
import { DatabaseModule } from "@/core/database/database.module";
import { EmailModule } from "@/modules/email/email.module";
import { SessionModule } from "@/modules/session/session.module";
import { PasswordChangeEffectsService } from "@/common/service/password-change-effects.service";

import { PasswordPolicyModule } from "@/modules/password-policy/password-policy.module";

@Module({
  imports: [
    PasswordPolicyModule,
    TypeOrmModule.forFeature([
      User,
      Tenant,
      UserRole,
      Role,
      RolePermission,
      Permission,
      SecurityEvent,
      UserInvite,
    ]),
    SecurityEventModule,
    DatabaseModule,
    EmailModule,
    SessionModule,
  ],
  controllers: [UserController],
  providers: [
    UserRepository,
    UserService,
    PasswordChangeEffectsService,
  ],
  exports: [UserService],
})
export class UserModule {}
