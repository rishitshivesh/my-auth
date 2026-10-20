import { scimError, SCIM_ERROR_SCHEMA } from "./scim-errors";

describe("scimError", () => {
  it("uses the RFC 7644 error schema with a string status", () => {
    const error = scimError(409, "User already exists", "uniqueness");
    expect(error.getStatus()).toBe(409);
    expect(error.body).toEqual({
      schemas: [SCIM_ERROR_SCHEMA],
      status: "409",
      detail: "User already exists",
      scimType: "uniqueness",
    });
  });

  it("omits scimType when not given and challenges on 401", () => {
    const error = scimError(401, "Invalid SCIM token");
    expect(error.body).not.toHaveProperty("scimType");
    expect(error.headers["WWW-Authenticate"]).toBe('Bearer realm="scim"');
  });
});
