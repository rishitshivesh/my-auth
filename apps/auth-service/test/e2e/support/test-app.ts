import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { DataSource } from "typeorm";
import Redis from "ioredis";
import request from "supertest";
import { AppApiModule } from "@/core/modules/app-module";
import { configureApp } from "@/core/configure-app";
import { MailService } from "@/modules/mail/mail.service";
import { RedisService } from "@/common/service/redis.service";
import { CapturingMailService, type MailCapture } from "./mail-capture";
import { TEST_REDIS_DB } from "../setup-env";

export interface HttpOptions {
  /** Tenant slug (sent as x-tenant-slug). */
  tenant?: string;
  /** Client IP (sent via X-Forwarded-For; TRUST_PROXY=1). Random by default so rate-limit buckets don't collide. */
  ip?: string;
  /** Bearer access token. */
  bearer?: string;
  /** Cookies to send, as returned by `set-cookie` (name=value[; attrs]). */
  cookies?: string[];
  headers?: Record<string, string>;
}

export interface HttpClient {
  get(path: string): request.Test;
  post(path: string): request.Test;
  put(path: string): request.Test;
  patch(path: string): request.Test;
  delete(path: string): request.Test;
  options(path: string): request.Test;
}

export interface TestApp {
  app: NestExpressApplication;
  http(opts?: HttpOptions): HttpClient;
  db: DataSource;
  /** Raw ioredis client on the dedicated test index (DB 15). */
  redis: Redis;
  mail: MailCapture;
  close(): Promise<void>;
}

export function randomIp(): string {
  const o = () => 1 + Math.floor(Math.random() * 253);
  return `10.${o()}.${o()}.${o()}`;
}

function cookieHeader(cookies: string[]): string {
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

function makeHttp(app: NestExpressApplication, opts: HttpOptions = {}): HttpClient {
  const ip = opts.ip ?? randomIp();
  const apply = (t: request.Test): request.Test => {
    t.set("x-forwarded-for", ip);
    if (opts.tenant) t.set("x-tenant-slug", opts.tenant);
    if (opts.bearer) t.set("authorization", `Bearer ${opts.bearer}`);
    if (opts.cookies?.length) t.set("cookie", cookieHeader(opts.cookies));
    for (const [k, v] of Object.entries(opts.headers ?? {})) t.set(k, v);
    return t;
  };
  const server = app.getHttpServer();
  return {
    get: (p) => apply(request(server).get(p)),
    post: (p) => apply(request(server).post(p)),
    put: (p) => apply(request(server).put(p)),
    patch: (p) => apply(request(server).patch(p)),
    delete: (p) => apply(request(server).delete(p)),
    options: (p) => apply(request(server).options(p)),
  };
}

/** Boots the real AppModule with the same global setup as production (configureApp). */
export async function createTestApp(): Promise<TestApp> {
  const dbName = new URL(process.env["DB_URL"] as string).pathname;
  if (!/_test/.test(dbName)) throw new Error("Refusing to boot: database is not a _test database");

  const mail = new CapturingMailService();
  const moduleRef = await Test.createTestingModule({ imports: [AppApiModule] })
    .overrideProvider(MailService)
    .useValue(mail)
    .compile();

  const app = moduleRef.createNestApplication<NestExpressApplication>({ logger: process.env["E2E_LOGS"] ? ["warn", "error"] : false });
  await configureApp(app, { startBackgroundJobs: false });
  await app.init();
  // Listen once for the app's lifetime: supertest otherwise opens and closes a temporary
  // listener around every request, and overlapping requests reset each other's sockets.
  await app.listen(0, "127.0.0.1");

  const db = app.get(DataSource);
  const redis = app.get(RedisService).getClient();
  if ((redis.options.db ?? 0) !== TEST_REDIS_DB) {
    await app.close();
    throw new Error("Refusing to run: Redis client is not on the test DB index");
  }

  return {
    app,
    http: (opts) => makeHttp(app, opts),
    db,
    redis,
    mail,
    close: () => app.close(),
  };
}
