import { describe, expect, it } from "@jest/globals";
import { randomKey } from "./random-id";

describe("randomKey", () => {
  it("is hex, the requested length and different each time", () => {
    const a = randomKey();
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(randomKey()).not.toBe(a);
    expect(randomKey(4)).toHaveLength(8);
  });
});
