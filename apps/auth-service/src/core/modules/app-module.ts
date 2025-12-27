import { Module } from "@nestjs/common";
import { GlobalModule } from "./global";
import { StatsModule } from "./stats/stats.module";
import { DatabaseModule } from "@/core/database/database.module";
import { CombinedModules } from "@/modules";

@Module({
  imports: [GlobalModule, StatsModule, DatabaseModule, CombinedModules],
})
export class AppApiModule {}
