import { validate } from "class-validator";
import { CreateTenantDto } from "./create-tenant.dto";

describe("CreateTenantDto validation", () => {
  it("accepts a valid payload", async () => {
    const dto = Object.assign(new CreateTenantDto(), { name: "Acme Corp", slug: "acme" });
    expect((await validate(dto)).length).toBe(0);
  });

  it("rejects a slug that is too short", async () => {
    const dto = Object.assign(new CreateTenantDto(), { name: "Acme Corp", slug: "ab" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "slug")).toBe(true);
  });

  it("rejects a slug with uppercase characters", async () => {
    const dto = Object.assign(new CreateTenantDto(), { name: "Acme Corp", slug: "Acme-Corp" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "slug")).toBe(true);
  });

  it("rejects an invalid ownerEmail", async () => {
    const dto = Object.assign(new CreateTenantDto(), {
      name: "Acme Corp",
      slug: "acme",
      ownerEmail: "not-an-email",
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "ownerEmail")).toBe(true);
  });

  it("rejects a non-string name", async () => {
    const dto = Object.assign(new CreateTenantDto(), { name: 123, slug: "acme" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "name")).toBe(true);
  });
});
