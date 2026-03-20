import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User, Session, Tenant, SecurityEvent, Role, UserRole } from "@repo/database";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";
import { RedisService } from "@/common/service/redis.service";
import { GuardsModule } from "@/common/guards/guards.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, Tenant, SecurityEvent, Role, UserRole]),
    GuardsModule,
  ],
  controllers: [AdminController],
  providers: [AdminService, RedisService],
})
export class AdminModule {}
