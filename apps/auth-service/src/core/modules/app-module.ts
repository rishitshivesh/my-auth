import { Module } from "@nestjs/common";
import { GlobalModule } from "./global";
import { StatsModule } from "./stats/stats.module";
import { DatabaseModule } from "@/core/database/database.module";

@Module({
  imports: [GlobalModule, StatsModule, DatabaseModule],
})
export class AppApiModule {}
