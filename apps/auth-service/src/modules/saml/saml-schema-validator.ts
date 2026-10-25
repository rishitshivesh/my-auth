import * as samlify from "samlify";

/**
 * samlify refuses to process any message until a schema validator is set
 * ("potentially vulnerable because no validation function found"). Full XSD
 * validation needs native libxml bindings, so enforce the security-relevant
 * subset instead:
 * - no DTDs or entity declarations (XXE / entity expansion),
 * - a hard size cap (parser DoS),
 * - at most one Assertion per message (XML signature wrapping: an attacker
 *   smuggles an unsigned assertion next to the signed one).
 * Structural checks (issuer, signature, conditions) stay in samlify.
 */
const DTD_PATTERN = /<!DOCTYPE|<!ENTITY|<!ELEMENT|<!ATTLIST/i;
const ASSERTION_OPEN_TAG = /<(?:[A-Za-z_][\w.-]*:)?Assertion[\s>/]/g;
export const MAX_SAML_MESSAGE_BYTES = 512 * 1024;

export function validateSamlMessage(xml: unknown): void {
  if (typeof xml !== "string" || xml.length === 0) {
    throw new Error("SAML message must be a non-empty string");
  }
  if (Buffer.byteLength(xml, "utf8") > MAX_SAML_MESSAGE_BYTES) {
    throw new Error("SAML message exceeds the maximum allowed size");
  }
  if (DTD_PATTERN.test(xml)) {
    throw new Error("DTD declarations are not allowed in SAML messages");
  }
  if ((xml.match(ASSERTION_OPEN_TAG) ?? []).length > 1) {
    throw new Error("Multiple assertions are not allowed in a SAML message");
  }
}

export function registerSamlSchemaValidator(): void {
  samlify.setSchemaValidator({
    validate: (xml: string): Promise<string> => {
      try {
        validateSamlMessage(xml);
        return Promise.resolve("valid");
      } catch (error: unknown) {
        return Promise.reject(error);
      }
    },
  });
}
