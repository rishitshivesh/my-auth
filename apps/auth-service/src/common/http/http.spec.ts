import { BadRequestException, HttpException, ValidationError } from "@nestjs/common";
import type { Response } from "express";
import {
  ApiException,
  ProtocolException,
  isConflict,
  validationExceptionFactory,
} from "./index";
import { ERROR_TITLES } from "./error-titles";
import {
  ACCESS_TOKEN_COOKIE,
  ACCESS_TOKEN_MAX_AGE_MS,
  ACCESS_TOKEN_TTL_SECONDS,
  MFA_ENROLLMENT_COOKIE,
  REFRESH_TOKEN_COOKIE,
  REFRESH_TOKEN_MAX_AGE_MS,
  SAML_SSO_NONCE_COOKIE,
  clearAuthCookies,
  clearSamlSsoNonceCookie,
  setAccessTokenCookie,
  setAuthCookies,
  setMfaEnrollmentCookie,
  setRefreshTokenCookie,
  setSamlSsoNonceCookie,
} from "./auth-cookies";
import { ProblemDetailsFilter, toProblemDetails } from "./problem-details.filter";

jest.mock("@/common/logger", () => ({ logger: { error: jest.fn() } }));
import { logger } from "@/common/logger";

function res() {
  const r = {
    headersSent: false,
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    set: jest.fn(),
    setHeader: jest.fn(),
    status: jest.fn(),
    type: jest.fn(),
    json: jest.fn(),
  };
  r.status.mockReturnValue(r);
  r.type.mockReturnValue(r);
  return r;
}

describe("ApiException / ProtocolException", () => {
  it("derives HTTP status from the code and carries options", () => {
    const e = new ApiException("VALIDATION_FAILED", {
      detail: "d",
      errors: [{ field: "a", message: "m" }],
    });
    expect(e).toBeInstanceOf(HttpException);
    expect(e.getStatus()).toBe(422);
    expect(e.code).toBe("VALIDATION_FAILED");
    expect(e.detail).toBe("d");
    expect(e.errors).toEqual([{ field: "a", message: "m" }]);
    expect(e.retryAfterSeconds).toBeUndefined();
  });

  it("ProtocolException keeps body, status and headers (default empty)", () => {
    const p = new ProtocolException(401, { error: "invalid_client" }, { "WWW-Authenticate": "Basic" });
    expect(p.getStatus()).toBe(401);
    expect(p.body).toEqual({ error: "invalid_client" });
    expect(p.headers).toEqual({ "WWW-Authenticate": "Basic" });
    expect(new ProtocolException(400, {}).headers).toEqual({});
  });

  it("isConflict only matches ApiException RESOURCE_CONFLICT", () => {
    expect(isConflict(new ApiException("RESOURCE_CONFLICT"))).toBe(true);
    expect(isConflict(new ApiException("BAD_REQUEST"))).toBe(false);
    expect(isConflict(new Error("RESOURCE_CONFLICT"))).toBe(false);
    expect(isConflict(null)).toBe(false);
  });
});

describe("validationExceptionFactory", () => {
  it("flattens nested constraints into dotted field paths", () => {
    const errors: ValidationError[] = [
      { property: "email", constraints: { isEmail: "bad email", isNotEmpty: "required" } },
      {
        property: "profile",
        children: [
          { property: "age", constraints: { min: "too low" } },
          { property: "address", children: [{ property: "zip", constraints: { len: "bad zip" } }] },
        ],
      },
    ];
    const e = validationExceptionFactory(errors);
    expect(e.code).toBe("VALIDATION_FAILED");
    expect(e.errors).toEqual([
      { field: "email", message: "bad email" },
      { field: "email", message: "required" },
      { field: "profile.age", message: "too low" },
      { field: "profile.address.zip", message: "bad zip" },
    ]);
  });

  it("handles empty input", () => {
    expect(validationExceptionFactory([]).errors).toEqual([]);
  });
});

describe("toProblemDetails", () => {
  it.each([
    [401, "AUTH_TOKEN_INVALID"],
    [403, "ACCESS_FORBIDDEN"],
    [404, "RESOURCE_NOT_FOUND"],
    [409, "RESOURCE_CONFLICT"],
    [413, "UPLOAD_TOO_LARGE"],
    [429, "RATE_LIMITED"],
    [501, "NOT_IMPLEMENTED"],
    [500, "INTERNAL_ERROR"],
    [503, "INTERNAL_ERROR"],
    [400, "BAD_REQUEST"],
    [422, "BAD_REQUEST"],
  ])("maps plain HTTP status %i to %s", (status, code) => {
    expect(toProblemDetails(new HttpException("x", status), "r").code).toBe(code);
  });

  it("maps http-errors style objects with numeric status", () => {
    expect(toProblemDetails({ status: 413 }, "r").code).toBe("UPLOAD_TOO_LARGE");
  });

  it.each([{ status: 200 }, { status: 700 }, { status: "404" }, null, "str", 42])(
    "treats %j as INTERNAL_ERROR",
    (thing) => {
      expect(toProblemDetails(thing, "r").code).toBe("INTERNAL_ERROR");
    },
  );

  it("includes detail, errors and retryAfter only when set", () => {
    const full = toProblemDetails(
      new ApiException("RATE_LIMITED", { detail: "slow", errors: [{ field: "f", message: "m" }], retryAfterSeconds: 0 }),
      "r",
    );
    expect(full).toMatchObject({ detail: "slow", errors: [{ field: "f", message: "m" }], retryAfterSeconds: 0 });
    const bare = toProblemDetails(new ApiException("BAD_REQUEST"), "r");
    expect(bare).not.toHaveProperty("detail");
    expect(bare).not.toHaveProperty("errors");
    expect(bare).not.toHaveProperty("retryAfterSeconds");
    expect(bare.title).toBe(ERROR_TITLES.BAD_REQUEST);
  });

  it("does not expose message of a Nest HttpException", () => {
    const p = toProblemDetails(new BadRequestException("secret internals"), "r");
    expect(JSON.stringify(p)).not.toContain("secret");
  });
});

describe("ProblemDetailsFilter", () => {
  const filter = new ProblemDetailsFilter();
  function host(response: ReturnType<typeof res>, request: Record<string, unknown> = {}) {
    return {
      switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
    } as never;
  }

  beforeEach(() => jest.clearAllMocks());

  it("does nothing when headers already sent", () => {
    const r = res();
    r.headersSent = true;
    filter.catch(new Error("x"), host(r));
    expect(r.status).not.toHaveBeenCalled();
  });

  it("sends ProtocolException body verbatim with its headers", () => {
    const r = res();
    filter.catch(new ProtocolException(401, { error: "invalid_token" }, { "WWW-Authenticate": "Bearer" }), host(r));
    expect(r.set).toHaveBeenCalledWith({ "WWW-Authenticate": "Bearer" });
    expect(r.status).toHaveBeenCalledWith(401);
    expect(r.json).toHaveBeenCalledWith({ error: "invalid_token" });
  });

  it("writes problem+json with request id and Retry-After", () => {
    const r = res();
    filter.catch(new ApiException("RATE_LIMITED", { retryAfterSeconds: 12 }), host(r, { requestId: "rid-1" }));
    expect(r.setHeader).toHaveBeenCalledWith("Retry-After", "12");
    expect(r.status).toHaveBeenCalledWith(429);
    expect(r.type).toHaveBeenCalledWith("application/problem+json");
    expect(r.json).toHaveBeenCalledWith(expect.objectContaining({ requestId: "rid-1", code: "RATE_LIMITED" }));
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("uses 'unknown' request id, logs 5xx and hides the message", () => {
    const r = res();
    filter.catch(new Error("leaky"), host(r));
    expect(r.setHeader).not.toHaveBeenCalled();
    expect(r.status).toHaveBeenCalledWith(500);
    expect(logger.error).toHaveBeenCalled();
    const body = r.json.mock.calls[0]![0] as { requestId: string };
    expect(body.requestId).toBe("unknown");
    expect(JSON.stringify(body)).not.toContain("leaky");
  });
});

describe("auth cookies", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("access cookie is httpOnly, strict, 15 min and TTL constants agree", () => {
    delete process.env["COOKIE_DOMAIN"];
    const r = res();
    setAccessTokenCookie(r as unknown as Response, "tok");
    expect(r.cookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, "tok", {
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/",
      maxAge: ACCESS_TOKEN_MAX_AGE_MS,
    });
    expect(ACCESS_TOKEN_TTL_SECONDS * 1000).toBe(ACCESS_TOKEN_MAX_AGE_MS);
  });

  it("is secure in production and honours COOKIE_DOMAIN", () => {
    process.env["NODE_ENV"] = "production";
    process.env["COOKIE_DOMAIN"] = ".scrolloop.com";
    const r = res();
    setRefreshTokenCookie(r as unknown as Response, "rt");
    expect(r.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      "rt",
      expect.objectContaining({ secure: true, domain: ".scrolloop.com", maxAge: REFRESH_TOKEN_MAX_AGE_MS }),
    );
  });

  it("setAuthCookies sets both; clearAuthCookies clears with matching attributes and no maxAge", () => {
    process.env["COOKIE_DOMAIN"] = "d.com";
    const r = res();
    setAuthCookies(r as unknown as Response, "a", "b");
    expect(r.cookie).toHaveBeenCalledTimes(2);
    clearAuthCookies(r as unknown as Response);
    expect(r.clearCookie).toHaveBeenCalledTimes(2);
    for (const call of r.clearCookie.mock.calls) {
      expect(call[1]).toEqual({ httpOnly: true, secure: false, sameSite: "strict", path: "/", domain: "d.com" });
    }
  });

  it("MFA enrollment and SAML nonce cookies are path-scoped and never carry a domain", () => {
    process.env["COOKIE_DOMAIN"] = "d.com";
    const r = res();
    setMfaEnrollmentCookie(r as unknown as Response, "m");
    setSamlSsoNonceCookie(r as unknown as Response, "n");
    const [mfa, saml] = r.cookie.mock.calls;
    expect(mfa![0]).toBe(MFA_ENROLLMENT_COOKIE);
    expect(mfa![2]).toMatchObject({ path: "/mfa/enroll", maxAge: 5 * 60 * 1000 });
    expect(mfa![2]).not.toHaveProperty("domain");
    expect(saml![0]).toBe(SAML_SSO_NONCE_COOKIE);
    expect(saml![2]).toMatchObject({ path: "/saml/sso", maxAge: 10 * 60 * 1000 });
    expect(saml![2]).not.toHaveProperty("domain");
    clearSamlSsoNonceCookie(r as unknown as Response);
    expect(r.clearCookie).toHaveBeenCalledWith(SAML_SSO_NONCE_COOKIE, expect.objectContaining({ path: "/saml/sso" }));
    expect(r.clearCookie.mock.calls[0]![1]).not.toHaveProperty("domain");
    expect(r.clearCookie.mock.calls[0]![1]).not.toHaveProperty("maxAge");
  });
});
