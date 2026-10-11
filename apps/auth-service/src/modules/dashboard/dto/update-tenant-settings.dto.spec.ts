import { validate } from "class-validator";
import { UpdateTenantSettingsDto } from "./update-tenant-settings.dto";

describe("UpdateTenantSettingsDto validation", () => {
  it("accepts a valid featureFlags map", async () => {
    const dto = Object.assign(new UpdateTenantSettingsDto(), {
      featureFlags: { mfaRequired: true },
    });
    expect((await validate(dto)).length).toBe(0);
  });

  it("rejects a missing featureFlags", async () => {
    const errors = await validate(new UpdateTenantSettingsDto());
    expect(errors.some((e) => e.property === "featureFlags")).toBe(true);
  });
});
