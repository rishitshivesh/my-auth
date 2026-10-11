import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { ScimUserDto } from "./scim-user.dto";

describe("ScimUserDto validation", () => {
  it("accepts a minimal valid SCIM user", async () => {
    const dto = plainToInstance(ScimUserDto, {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: "jdoe",
    });
    expect((await validate(dto)).length).toBe(0);
  });

  it("rejects a missing userName", async () => {
    const dto = plainToInstance(ScimUserDto, {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "userName")).toBe(true);
  });

  it("rejects a malformed nested email", async () => {
    const dto = plainToInstance(ScimUserDto, {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
      userName: "jdoe",
      emails: [{ value: 123 }],
    });
    const errors = await validate(dto);
    const emailErrors = errors.find((e) => e.property === "emails");
    expect(emailErrors).toBeDefined();
  });
});
