import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User, Session, SecurityEvent } from "@repo/database";
import { UserController } from "./user.controller";
import { UserService } from "./user.service";

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
  imports: [TypeOrmModule.forFeature([User, Session, SecurityEvent])],
  controllers: [UserController],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
