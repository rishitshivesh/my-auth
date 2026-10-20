import { ProtocolException } from "@/common/http";
import { oauthError } from "./oauth-errors";

describe("oauthError", () => {
  it("returns an RFC 6749 body with 400 for invalid_grant", () => {
    const error = oauthError("invalid_grant", "Authorization code expired");
    expect(error).toBeInstanceOf(ProtocolException);
    expect(error.getStatus()).toBe(400);
    expect(error.body).toEqual({
      error: "invalid_grant",
      error_description: "Authorization code expired",
    });
  });

  it("returns 401 with a Basic challenge for invalid_client", () => {
    const error = oauthError("invalid_client", "Client authentication failed");
    expect(error.getStatus()).toBe(401);
    expect(error.headers["WWW-Authenticate"]).toMatch(/^Basic /);
  });

  it("returns 401 with a Bearer challenge for invalid_token", () => {
    const error = oauthError("invalid_token", "Access token expired");
    expect(error.getStatus()).toBe(401);
    expect(error.headers["WWW-Authenticate"]).toContain('Bearer error="invalid_token"');
  });
});
