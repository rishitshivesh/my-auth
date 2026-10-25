import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { ChangePasswordDto } from "@/modules/user/user.dto";
import { RegisterDto, ResetPasswordDto } from "./auth.dto";

async function errorsFor<T extends object>(cls: new () => T, plain: object): Promise<string[]> {
  const errors = await validate(plainToInstance(cls, plain));
  return errors.map((e) => e.property);
}

describe("password DTOs defer composition rules to the shared password policy", () => {
  const passphrase = "correct horse battery staple";

  it("RegisterDto accepts a long passphrase without a symbol", async () => {
    expect(await errorsFor(RegisterDto, { email: "a@b.co", password: passphrase })).toEqual([]);
  });

  it("RegisterDto still rejects a password over the max length", async () => {
    expect(await errorsFor(RegisterDto, { email: "a@b.co", password: "x".repeat(129) })).toContain("password");
  });

  it("ResetPasswordDto accepts a passphrase without a symbol", async () => {
    expect(await errorsFor(ResetPasswordDto, { email: "a@b.co", otp: "123456", password: passphrase })).toEqual([]);
  });

  it("ChangePasswordDto accepts a passphrase without a symbol", async () => {
    expect(await errorsFor(ChangePasswordDto, { currentPassword: "old", newPassword: passphrase })).toEqual([]);
  });
});
