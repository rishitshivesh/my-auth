import { Module, ValidationPipe } from "@nestjs/common";
import { NestFactory, Reflector } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppApiModule } from "./modules/app-module";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { logger } from '@/common/logger';
import { ResponseInterceptor } from '@/common/interceptors/response.interceptors';
import { CorsRefreshService } from "./cors-refresh.service";
import { AdminService } from "@/modules/admin/admin.service";
import cookieParser from "cookie-parser";
import session from "express-session";
import helmet from "helmet";

/**
 * TRUST_PROXY accepts the same values as Express' "trust proxy" setting:
 * a hop count ("1"), "true", or a comma-separated list of subnets/keywords
 * ("loopback, 10.0.0.0/8"). Unset → Express default (trust nothing).
 */
function resolveTrustProxy(raw: string | undefined): boolean | number | string | undefined {
  if (raw === undefined || raw.trim() === "") return undefined;
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (/^\d+$/.test(value)) return parseInt(value, 10);
  return value;
}

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
    const app = await NestFactory.create<NestExpressApplication>(AppApiModule, {
      bufferLogs: true,
    });

    // Behind a load balancer / ingress, request.ip is the proxy's address
    // unless Express is told how many hops to trust. Without this every
    // client shares one IP-keyed rate-limit bucket. See TRUST_PROXY in
    // .env.example.
    const trustProxy = resolveTrustProxy(process.env["TRUST_PROXY"]);
    if (trustProxy !== undefined) {
      app.set("trust proxy", trustProxy);
    }

    // Close DB pools / Redis connections cleanly on SIGTERM (rolling deploys).
    app.enableShutdownHooks();

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

    // Used to allow all origins during first-run bootstrap.
    // The setup token authenticates those requests; CORS enforcement is
    // meaningless before any tenant or admin exists.
    const adminService = app.get(AdminService);

    // Origins allowed during first-run bootstrap in addition to staticOrigins.
    // Never reflect the request's own origin — only accept known safe values.
    const bootstrapOrigins = new Set<string>([
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      ...(process.env['ADMIN_PORTAL_ORIGIN'] ? [process.env['ADMIN_PORTAL_ORIGIN']] : []),
    ]);

    app.enableCors({
      origin: (
        origin: string | undefined,
        cb: (err: Error | null, allow?: boolean) => void,
      ) => {
        if (!origin) return cb(null, true);
        if (staticOrigins.includes(origin) || dynamicOrigins.has(origin)) {
          return cb(null, true);
        }
        // During first-run bootstrap, allow localhost + the configured admin portal.
        // The setup token authenticates these requests; CORS is a browser-only
        // control and the token is the real secret here.
        if (adminService.isBootstrapping() && bootstrapOrigins.has(origin)) {
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
        "x-tenant-slug",
        "x-authorization",
        "x-csrf-token",
        "x-setup-token",
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
        .setTitle("Scrolloop Sentry Auth Service")
        .setDescription(
          "Multi-tenant authentication, authorization and identity APIs. " +
            "Tenant-scoped routes require X-Tenant-Slug (or a tenant subdomain).",
        )
        .setVersion(process.env["npm_package_version"] ?? "0.0.0")
        .addBearerAuth()
        .addCookieAuth("accessToken")
        .build();

      const documentForGeneralApis = SwaggerModule.createDocument(app, config);
      SwaggerModule.setup("api-docs", app, documentForGeneralApis);
    }

    app.useGlobalInterceptors(new ResponseInterceptor(app.get(Reflector)));

    app.use(
      session({
        // Used only for the short-lived OAuth/social-login handshake state.
        name: "sentry.sid",
        secret: process.env.SESSION_SECRET!,
        resave: false,
        saveUninitialized: false,
        cookie: {
          httpOnly: true,
          secure: isProduction,
          sameSite: "lax",
          maxAge: 10 * 60 * 1000,
        },
      }),
    );

    const port = process.env.PORT || 4000;
    await app.listen(port);
    logger.info(`Application is running on port ${port}`);
  }
}
