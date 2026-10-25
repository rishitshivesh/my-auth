import { describe, expect, it } from "@jest/globals";
import { PRODUCT_NAME, titleFromHeading } from "./document-title";

describe("titleFromHeading", () => {
  it("puts the page heading before the product name", () => {
    expect(titleFromHeading("  Roles \n ")).toBe(`Roles · ${PRODUCT_NAME}`);
  });
  it("falls back to the product name", () => {
    expect(titleFromHeading("")).toBe(PRODUCT_NAME);
    expect(titleFromHeading(null)).toBe(PRODUCT_NAME);
  });
});
