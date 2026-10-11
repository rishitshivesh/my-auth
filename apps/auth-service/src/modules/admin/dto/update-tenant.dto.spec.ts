import { validate } from "class-validator";
import { UpdateTenantDto } from "./update-tenant.dto";

describe("UpdateTenantDto validation", () => {
  it("accepts an empty payload (all fields optional)", async () => {
    expect((await validate(new UpdateTenantDto())).length).toBe(0);
  });

  it("accepts a valid status", async () => {
    const dto = Object.assign(new UpdateTenantDto(), { status: "suspended" });
    expect((await validate(dto)).length).toBe(0);
  });

  it("rejects a status outside the allowlist", async () => {
    const dto = Object.assign(new UpdateTenantDto(), { status: "deleted" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "status")).toBe(true);
  });
});
