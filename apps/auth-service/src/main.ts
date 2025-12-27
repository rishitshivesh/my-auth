import { logger } from "./common/logger";
import { AppModule } from "./core/app.module";

async function bootstrap() {
  try {
    console.log(process.env);

    await AppModule.startApp();
  } catch (err: any) {
    logger.error("Error starting the application: ", err);
    logger.error(err);
    process.exit(1);
  }
}

bootstrap();
