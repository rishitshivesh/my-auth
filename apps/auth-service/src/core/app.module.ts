import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppApiModule } from "./modules/app-module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { logger } from "src/common/logger";
import { ResponseInterceptor } from "src/common/interceptors/response.interceptors";
import { saveApiDoc } from "./services/utility/utility.service";
import { ALLOWED_URLS } from "../common/constants";
import cookieParser from "cookie-parser";
import session from "express-session";

@Module({
  imports: [],
})
export class AppModule {
  static async startApp(): Promise<void> {
    const app = await NestFactory.create(AppApiModule, { bufferLogs: true });
    app.enableCors({
      origin: (origin: any, cb: any) => {
        // allow non-browser calls (curl/postman/server-to-server)
        if (!origin) return cb(null, true);

        const allowed = ALLOWED_URLS.includes(origin);
        return allowed
          ? cb(null, true)
          : cb(new Error(`CORS blocked for origin: ${origin}`), false);
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

    app.use((req: any, _res: any, next: any) => {
      if (req.method === "OPTIONS") {
        console.log("Preflight:", {
          origin: req.headers.origin,
          acrm: req.headers["access-control-request-method"],
          acrh: req.headers["access-control-request-headers"],
          path: req.path,
        });
      }
      next();
    });
    
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

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

    if (app) {
      logger.info("Application started successfully");
      logger.info(`Application is running on: ${process.env.PORT}`);
      app.useGlobalInterceptors(new ResponseInterceptor());
      app.use(cookieParser());
      // app.setGlobalPrefix('api');
      app.use(
        session({
          secret: "nest-session-secret",
          resave: false,
          saveUninitialized: false,
        }),
      );
      await app.listen(process.env.PORT || 4000);
    }
  }
}
