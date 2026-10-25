import { sanitizeCsvValue, toCsvCell } from "./csv-sanitize";

describe("sanitizeCsvValue", () => {
  it.each(["=SUM(A1)", "+1", "-1", "@cmd", "\tx", "\rx"])(
    "prefixes a single quote to the formula-leading value %j",
    (value) => {
      expect(sanitizeCsvValue(value)).toBe(`'${value}`);
    },
  );

  it.each([
    ["plain text", "hello"],
    ["empty string", ""],
    ["a formula character that is not leading", "a=b"],
  ])("leaves %s untouched", (_name, value) => {
    expect(sanitizeCsvValue(value)).toBe(value);
  });

  it.each([null, undefined])("renders %s as an empty string", (value) => {
    expect(sanitizeCsvValue(value)).toBe("");
  });

  it("stringifies non-string values", () => {
    expect(sanitizeCsvValue(42)).toBe("42");
    expect(sanitizeCsvValue(-5)).toBe("'-5");
  });
});

describe("toCsvCell", () => {
  it("wraps the value in quotes and doubles embedded quotes", () => {
    expect(toCsvCell('say "hi"')).toBe('"say ""hi"""');
  });

  it("neutralises a formula before quoting it", () => {
    expect(toCsvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
  });
});
