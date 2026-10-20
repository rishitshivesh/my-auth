import { BadRequestException } from "@nestjs/common";
import { ApiException } from "./api.exception";
import { toProblemDetails } from "./problem-details.filter";

describe("toProblemDetails", () => {
  it("maps an ApiException to its code, status and requestId", () => {
    const problem = toProblemDetails(
      new ApiException("RATE_LIMITED", { retryAfterSeconds: 30 }),
      "req-12345678",
    );
    expect(problem).toMatchObject({
      code: "RATE_LIMITED",
      status: 429,
      requestId: "req-12345678",
      retryAfterSeconds: 30,
      type: "urn:scrolloop:problem:RATE_LIMITED",
    });
  });

  it("never leaks the message of an unexpected error", () => {
    const problem = toProblemDetails(new Error("db password is hunter2"), "req-12345678");
    expect(problem.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(problem)).not.toContain("hunter2");
  });

  it("maps a plain Nest exception by status", () => {
    expect(toProblemDetails(new BadRequestException("x"), "r").code).toBe("BAD_REQUEST");
  });
});
