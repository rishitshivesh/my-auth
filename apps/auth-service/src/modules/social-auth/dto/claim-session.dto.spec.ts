import { validate } from "class-validator";
import { ClaimSessionDto } from "./claim-session.dto";

describe("ClaimSessionDto validation", () => {
  it("accepts a well-formed JWT", async () => {
    const dto = Object.assign(new ClaimSessionDto(), {
      ct: "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjMifQ.sig",
    });
    expect((await validate(dto)).length).toBe(0);
  });

  it("rejects a non-JWT string", async () => {
    const dto = Object.assign(new ClaimSessionDto(), { ct: "not-a-jwt" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "ct")).toBe(true);
  });
});
