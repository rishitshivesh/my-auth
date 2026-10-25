import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppApiModule } from "./modules/app-module";
import { logger } from '@/common/logger';

import { configureApp } from "./configure-app";

@Module({
  imports: [],
})
export class AppModule {
  static async startApp(): Promise<void> {
    const app = await NestFactory.create<NestExpressApplication>(AppApiModule, {
      bufferLogs: true,
    });

    await configureApp(app);

    const port = process.env.PORT || 4000;
    await app.listen(port);
    logger.info(`Application is running on port ${port}`);
  }
}
