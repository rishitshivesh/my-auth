import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { SecurityEvent } from "@repo/database";
import { SecurityEventService } from "./security-event.service";

/**
 * SecurityEventModule
 *
 * Provides and exports SecurityEventService.
 * Import this module into any feature module that needs to write audit events.
 */
@Module({
  imports: [TypeOrmModule.forFeature([SecurityEvent])],
  providers: [SecurityEventService],
  exports: [SecurityEventService],
})
export class SecurityEventModule {}
