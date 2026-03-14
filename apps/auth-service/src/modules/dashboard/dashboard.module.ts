import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { User, Session, MfaSettings } from "@repo/database";
import { DashboardController } from "./dashboard.controller";

@Module({
  imports: [TypeOrmModule.forFeature([User, Session, MfaSettings])],
  controllers: [DashboardController],
})
export class DashboardModule {}
