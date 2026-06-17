import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppApiModule } from "./modules/app-module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { logger } from "src/common/logger";
import { ResponseInterceptor } from "src/common/interceptors/response.interceptors";
import { saveApiDoc } from "./services/utility/utility.service";
import { CorsRefreshService } from "./cors-refresh.service";
import cookieParser from "cookie-parser";
import session from "express-session";
import helmet from "helmet";

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS || "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

@Module({
  imports: [],
})
export class AppModule {
  static async startApp(): Promise<void> {
    const app = await NestFactory.create(AppApiModule, { bufferLogs: true });

    const isProduction = process.env.NODE_ENV === "production";
    const staticOrigins = parseCorsOrigins();

    // Security headers
    app.use(
      helmet({
        contentSecurityPolicy: isProduction ? undefined : false,
      }),
    );

    // Cookie parser must be registered before interceptors
    app.use(cookieParser());

    // Load per-tenant + per-client CORS origins from the database
    const corsRefreshService = app.get(CorsRefreshService);
    await corsRefreshService.refresh();
    corsRefreshService.startAutoRefresh();

    const dynamicOrigins = corsRefreshService.getOrigins();

    app.enableCors({
      origin: (
        origin: string | undefined,
        cb: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin) return cb(null, true);
        if (staticOrigins.includes(origin) || dynamicOrigins.has(origin)) {
          return cb(null, true);
        }
        return cb(new Error(`CORS blocked for origin: ${origin}`), false);
      },
      credentials: true,
      methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "x-tenant-id",
        "x-authorization",
        "x-csrf-token",
      ],
      exposedHeaders: ["set-cookie"],
      optionsSuccessStatus: 204,
    });

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    // Swagger — disabled in production
    if (!isProduction) {
      const config = new DocumentBuilder()
        .setTitle("identity-server")
        .setDescription("API for Identity Server")
        .setVersion("1.0")
        .setExternalDoc("Sample", "https://id.sample.com")
        .addBearerAuth()
        .build();

      const documentForGeneralApis = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup("api-docs", app, documentForGeneralApis);
      saveApiDoc("api-docs", documentForGeneralApis, "nest-be");
    }

    app.useGlobalInterceptors(new ResponseInterceptor());

    app.use(
      session({
        secret: process.env.SESSION_SECRET!,
        resave: false,
        saveUninitialized: false,
      }),
    );

    const port = process.env.PORT || 4000;
    await app.listen(port);
    logger.info(`Application is running on port ${port}`);
  }
}
