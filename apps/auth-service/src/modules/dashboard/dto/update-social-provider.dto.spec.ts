import { validate } from "class-validator";
import { UpdateSocialProviderDto } from "./update-social-provider.dto";

describe("UpdateSocialProviderDto validation", () => {
  it("accepts a valid payload", async () => {
    const dto = Object.assign(new UpdateSocialProviderDto(), { enabled: true });
    expect((await validate(dto)).length).toBe(0);
  });

  it("rejects a non-boolean enabled", async () => {
    const dto = Object.assign(new UpdateSocialProviderDto(), { enabled: "yes" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "enabled")).toBe(true);
  });
});
