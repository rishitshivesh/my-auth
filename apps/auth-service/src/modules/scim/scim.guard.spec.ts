import { ProtocolException } from "@/common/http";
import { ScimAuthGuard } from "./scim.guard";

function ctx(headers: Record<string, string | undefined>) {
  const req: { headers: Record<string, string | undefined>; scimTenantId?: string } = { headers };
  return {
    req,
    context: { switchToHttp: () => ({ getRequest: () => req }) } as never,
  };
}

describe("ScimAuthGuard", () => {
  const build = () => {
    const tokens = { validateToken: jest.fn() };
    return { guard: new ScimAuthGuard(tokens as never), tokens };
  };

  it("accepts a valid bearer token and binds tenant to request", async () => {
    const { guard, tokens } = build();
    tokens.validateToken.mockResolvedValue({ tenantId: "t9" });
    const { req, context } = ctx({ authorization: "Bearer scim_abc" });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(tokens.validateToken).toHaveBeenCalledWith("scim_abc");
    expect(req.scimTenantId).toBe("t9");
  });

  it.each([
    ["missing header", undefined],
    ["Basic scheme", "Basic abc"],
    ["lowercase bearer", "bearer scim_abc"],
    ["no space", "Bearerscim_abc"],
    ["empty string", ""],
  ])("rejects %s with 401 without validating", async (_n, header) => {
    const { guard, tokens } = build();
    const { context } = ctx({ authorization: header });
    const err = (await guard.canActivate(context).catch((e: unknown) => e)) as ProtocolException;
    expect(err).toBeInstanceOf(ProtocolException);
    expect(err.getStatus()).toBe(401);
    expect(tokens.validateToken).not.toHaveBeenCalled();
  });

  it("propagates validation failure and leaves tenant unset", async () => {
    const { guard, tokens } = build();
    tokens.validateToken.mockRejectedValue(new ProtocolException(401, { detail: "bad" }));
    const { req, context } = ctx({ authorization: "Bearer nope" });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ProtocolException);
    expect(req.scimTenantId).toBeUndefined();
  });

  it("an empty bearer value is still forwarded (and rejected) by the token service", async () => {
    const { guard, tokens } = build();
    tokens.validateToken.mockRejectedValue(new ProtocolException(401, {}));
    const { context } = ctx({ authorization: "Bearer " });
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ProtocolException);
    expect(tokens.validateToken).toHaveBeenCalledWith("");
  });
});
