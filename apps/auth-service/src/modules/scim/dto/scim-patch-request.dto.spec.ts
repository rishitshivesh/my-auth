import { validate } from "class-validator";
import { plainToInstance } from "class-transformer";
import { ScimPatchRequestDto } from "./scim-patch-request.dto";

describe("ScimPatchRequestDto validation", () => {
  it("accepts a valid patch request", async () => {
    const dto = plainToInstance(ScimPatchRequestDto, {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "replace", path: "active", value: false }],
    });
    expect((await validate(dto)).length).toBe(0);
  });

  it("rejects an empty Operations array", async () => {
    const dto = plainToInstance(ScimPatchRequestDto, {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [],
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "Operations")).toBe(true);
  });

  it("rejects an invalid op value", async () => {
    const dto = plainToInstance(ScimPatchRequestDto, {
      schemas: ["urn:ietf:params:scim:api:messages:2.0:PatchOp"],
      Operations: [{ op: "delete" }],
    });
    const errors = await validate(dto);
    const opErrors = errors.find((e) => e.property === "Operations");
    expect(opErrors).toBeDefined();
  });
});
