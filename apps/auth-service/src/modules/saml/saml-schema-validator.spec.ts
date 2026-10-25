import * as samlify from "samlify";
import {
  MAX_SAML_MESSAGE_BYTES,
  registerSamlSchemaValidator,
  validateSamlMessage,
} from "./saml-schema-validator";

const NS = 'xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"';
const response = (...assertions: string[]) => `<samlp:Response>${assertions.join("")}</samlp:Response>`;
const assertion = (id: string) => `<saml:Assertion ${NS} ID="${id}"><saml:Issuer>idp</saml:Issuer></saml:Assertion>`;

describe("validateSamlMessage", () => {
  it("accepts a well-formed single-assertion response", () => {
    expect(() => validateSamlMessage(response(assertion("a1")))).not.toThrow();
  });

  it("accepts a response with no plaintext assertion (encrypted or logout)", () => {
    expect(() => validateSamlMessage("<samlp:LogoutRequest/>")).not.toThrow();
  });

  it.each([undefined, null, 42, "", {}])("rejects non-string or empty input %j", (input) => {
    expect(() => validateSamlMessage(input)).toThrow("non-empty string");
  });

  describe("XXE / entity expansion", () => {
    it.each([
      ["DOCTYPE", '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><a>&xxe;</a>'],
      ["lowercase doctype", "<!doctype a><a/>"],
      ["ENTITY only", '<!ENTITY x "y"><a/>'],
      ["ELEMENT", "<!ELEMENT a ANY><a/>"],
      ["ATTLIST", "<!ATTLIST a b CDATA #IMPLIED><a/>"],
      ["billion laughs", '<!DOCTYPE l [<!ENTITY a "aa"><!ENTITY b "&a;&a;">]><l>&b;</l>'],
    ])("rejects %s", (_name, xml) => {
      expect(() => validateSamlMessage(xml)).toThrow("DTD declarations are not allowed");
    });

    it("rejects a DTD hidden after a valid-looking assertion", () => {
      expect(() => validateSamlMessage(`${response(assertion("a1"))}<!DOCTYPE x>`)).toThrow("DTD");
    });
  });

  describe("signature wrapping", () => {
    it("rejects a second (smuggled) assertion beside the signed one", () => {
      expect(() => validateSamlMessage(response(assertion("signed"), assertion("evil")))).toThrow("Multiple assertions");
    });

    it("rejects a smuggled assertion using a different prefix or the default namespace", () => {
      const evil = '<Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion" ID="evil"/>';
      expect(() => validateSamlMessage(response(assertion("signed"), evil))).toThrow("Multiple assertions");
      const other = '<s2:Assertion xmlns:s2="urn:oasis:names:tc:SAML:2.0:assertion" ID="evil"/>';
      expect(() => validateSamlMessage(response(assertion("signed"), other))).toThrow("Multiple assertions");
    });

    it("rejects a self-closing smuggled assertion", () => {
      expect(() => validateSamlMessage(response(assertion("signed"), "<saml:Assertion/>"))).toThrow("Multiple assertions");
    });

    it("does not mistake EncryptedAssertion or AssertionConsumerServiceURL for an assertion", () => {
      const xml = response(assertion("a1"), "<saml:EncryptedAssertion/>", "<x:AssertionConsumerService/>");
      expect(() => validateSamlMessage(xml)).not.toThrow();
    });
  });

  describe("size limits", () => {
    it("accepts a message exactly at the limit", () => {
      const pad = "a".repeat(MAX_SAML_MESSAGE_BYTES - "<a></a>".length);
      expect(() => validateSamlMessage(`<a>${pad}</a>`)).not.toThrow();
    });

    it("rejects a message one byte over the limit", () => {
      const pad = "a".repeat(MAX_SAML_MESSAGE_BYTES - "<a></a>".length + 1);
      expect(() => validateSamlMessage(`<a>${pad}</a>`)).toThrow("maximum allowed size");
    });

    it("measures bytes, not characters (multi-byte payloads)", () => {
      const pad = "€".repeat(Math.ceil(MAX_SAML_MESSAGE_BYTES / 3) + 1);
      expect(pad.length).toBeLessThan(MAX_SAML_MESSAGE_BYTES);
      expect(() => validateSamlMessage(`<a>${pad}</a>`)).toThrow("maximum allowed size");
    });
  });
});

describe("registerSamlSchemaValidator", () => {
  it("installs a validator that resolves valid XML and rejects hostile XML", async () => {
    const spy = jest.spyOn(samlify, "setSchemaValidator");
    registerSamlSchemaValidator();
    const { validate } = spy.mock.calls[0]![0] as { validate: (xml: string) => Promise<string> };
    await expect(validate(response(assertion("a1")))).resolves.toBe("valid");
    await expect(validate("<!DOCTYPE a><a/>")).rejects.toThrow("DTD");
    await expect(validate(response(assertion("a"), assertion("b")))).rejects.toThrow("Multiple assertions");
    spy.mockRestore();
  });
});
