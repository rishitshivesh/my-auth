import type { NextFunction, Request, Response } from "express";
import { requestIdMiddleware } from "./request-id.middleware";

function run(header?: string) {
  const req = { header: () => header, requestId: undefined } as unknown as Request;
  const setHeader = jest.fn();
  const res = { setHeader } as unknown as Response;
  const next: NextFunction = jest.fn();
  requestIdMiddleware(req, res, next);
  return { req, setHeader, next };
}

describe("requestIdMiddleware", () => {
  it("accepts a safe incoming id", () => {
    const { req, setHeader, next } = run("abc-12345.XYZ_");
    expect(req.requestId).toBe("abc-12345.XYZ_");
    expect(setHeader).toHaveBeenCalledWith("x-request-id", "abc-12345.XYZ_");
    expect(next).toHaveBeenCalled();
  });

  it.each(["short", "has space in it!", "x".repeat(65), "bad\nheader-value"])(
    "replaces unsafe id %j with a uuid",
    (bad) => {
      const { req } = run(bad);
      expect(req.requestId).toMatch(/^[0-9a-f-]{36}$/);
    },
  );

  it("generates an id when none is supplied", () => {
    const { req, setHeader } = run(undefined);
    expect(setHeader).toHaveBeenCalledWith("x-request-id", req.requestId);
  });
});
