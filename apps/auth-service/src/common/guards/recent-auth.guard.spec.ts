import { ExecutionContext } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiException } from "../http";
import { RecentAuthGuard } from "./recent-auth.guard";

const WINDOW_SECONDS = 300;
const NOW_MS = Date.UTC(2026, 0, 1, 12, 0, 0);
const NOW_SECONDS = NOW_MS / 1000;

function contextFor(user: { authTime?: number } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe("RecentAuthGuard", () => {
  const config = {
    get: jest.fn((_key: string, fallback: number) => (fallback === 300 ? WINDOW_SECONDS : fallback)),
  } as unknown as ConfigService;
  const guard = new RecentAuthGuard(config);

  beforeEach(() => jest.spyOn(Date, "now").mockReturnValue(NOW_MS));
  afterEach(() => jest.restoreAllMocks());

  it("allows a login inside the window", () => {
    expect(guard.canActivate(contextFor({ authTime: NOW_SECONDS - 60 }))).toBe(true);
  });

  it("rejects a login older than the window with ACCESS_RECENT_AUTH_REQUIRED", () => {
    expect.assertions(2);
    try {
      guard.canActivate(contextFor({ authTime: NOW_SECONDS - WINDOW_SECONDS - 1 }));
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ApiException);
      expect((err as ApiException).code).toBe("ACCESS_RECENT_AUTH_REQUIRED");
    }
  });

  it("treats a token without the authTime claim as stale", () => {
    expect(() => guard.canActivate(contextFor({}))).toThrow(ApiException);
  });

  it("treats a missing user as stale", () => {
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ApiException);
  });
});
