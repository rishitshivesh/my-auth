import { CallHandler, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { lastValueFrom, of, throwError } from "rxjs";
import { RAW_RESPONSE_KEY } from "@/common/decorators/raw-response.decorator";
import { RedisService } from "@/common/service/redis.service";
import { ApiCallInterceptor } from "./api-call.interceptor";
import { ResponseInterceptor } from "./response.interceptors";

function ctx(req: unknown, res: unknown = {}): ExecutionContext {
  const handler = () => undefined;
  class Cls {}
  return {
    switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
    getHandler: () => handler,
    getClass: () => Cls,
  } as unknown as ExecutionContext;
}

const flush = () => new Promise<void>((r) => setImmediate(r));

describe("ApiCallInterceptor", () => {
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ["setImmediate", "nextTick"] });
    jest.setSystemTime(new Date("2026-03-05T23:59:59Z"));
  });
  afterEach(() => jest.useRealTimers());

  function make() {
    const redis = {
      incr: jest.fn().mockResolvedValue(1),
      expireAtTimestamp: jest.fn().mockResolvedValue(undefined),
    };
    return { redis, i: new ApiCallInterceptor(redis as unknown as RedisService) };
  }

  it("increments the per-tenant daily counter and sets a 35-day absolute expiry", async () => {
    const { i, redis } = make();
    const out = await lastValueFrom(i.intercept(ctx({ tenantId: "t1" }), { handle: () => of("ok") }));
    await flush();
    expect(out).toBe("ok");
    expect(redis.incr).toHaveBeenCalledWith("t1", "api_calls", "2026-03-05");
    const expected = Math.floor(Date.now() / 1000) + 35 * 24 * 60 * 60;
    expect(redis.expireAtTimestamp).toHaveBeenCalledWith("t1", "api_calls", "2026-03-05", expected);
  });

  it("does nothing without a tenant", async () => {
    const { i, redis } = make();
    await lastValueFrom(i.intercept(ctx({}), { handle: () => of(1) }));
    await flush();
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("swallows redis failures without affecting the response", async () => {
    const { i, redis } = make();
    redis.incr.mockRejectedValue(new Error("redis down"));
    await expect(lastValueFrom(i.intercept(ctx({ tenantId: "t" }), { handle: () => of("fine") }))).resolves.toBe("fine");
    await flush();
    expect(redis.expireAtTimestamp).not.toHaveBeenCalled();
  });

  it("does not count failed requests", async () => {
    const { i, redis } = make();
    await expect(
      lastValueFrom(i.intercept(ctx({ tenantId: "t" }), { handle: () => throwError(() => new Error("boom")) })),
    ).rejects.toThrow("boom");
    await flush();
    expect(redis.incr).not.toHaveBeenCalled();
  });
});

describe("ResponseInterceptor", () => {
  function make(raw: boolean | undefined) {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(raw) };
    return { reflector, i: new ResponseInterceptor<unknown>(reflector as unknown as Reflector) };
  }
  const handler = (v: unknown): CallHandler => ({ handle: () => of(v) });

  it("wraps data with the real status code", async () => {
    const { i, reflector } = make(undefined);
    const c = ctx({}, { statusCode: 201 });
    await expect(lastValueFrom(i.intercept(c, handler({ a: 1 })))).resolves.toEqual({ status: 201, data: { a: 1 } });
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(RAW_RESPONSE_KEY, expect.any(Array));
  });

  it("defaults to 200 when the response has no status", async () => {
    const { i } = make(false);
    await expect(lastValueFrom(i.intercept(ctx({}, {}), handler(null)))).resolves.toEqual({ status: 200, data: null });
    await expect(lastValueFrom(i.intercept(ctx({}, undefined), handler("x")))).resolves.toEqual({ status: 200, data: "x" });
  });

  it("returns raw responses unwrapped", async () => {
    const { i } = make(true);
    await expect(lastValueFrom(i.intercept(ctx({}, { statusCode: 202 }), handler({ raw: true })))).resolves.toEqual({ raw: true });
  });
});
