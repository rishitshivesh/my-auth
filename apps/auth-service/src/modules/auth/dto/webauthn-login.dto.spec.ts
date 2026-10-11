import { validate } from "class-validator";
import { StartWebAuthnLoginDto, FinishWebAuthnLoginDto } from "./webauthn-login.dto";

describe("StartWebAuthnLoginDto validation", () => {
  it("rejects an invalid email", async () => {
    const dto = Object.assign(new StartWebAuthnLoginDto(), { email: "not-an-email" });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "email")).toBe(true);
  });
});

describe("FinishWebAuthnLoginDto validation", () => {
  it("accepts a valid payload", async () => {
    const dto = Object.assign(new FinishWebAuthnLoginDto(), {
      email: "user@example.com",
      response: { id: "cred-1" },
      sessionNonce: "nonce-1",
    });
    expect((await validate(dto)).length).toBe(0);
  });

  it("rejects a missing sessionNonce", async () => {
    const dto = Object.assign(new FinishWebAuthnLoginDto(), {
      email: "user@example.com",
      response: { id: "cred-1" },
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === "sessionNonce")).toBe(true);
  });
});
