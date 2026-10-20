import { ProtocolException } from "@/common/http";

const REASONS: Readonly<Record<number, string>> = {
  400: "Bad Request",
  401: "Unauthorized",
  404: "Not Found",
};

/**
 * SSO endpoints are driven by browsers and service providers, so they keep
 * their long-standing body shape (statusCode/message/error) instead of
 * RFC 9457 problem details.
 */
export function samlError(status: 400 | 401 | 404, message: string): ProtocolException {
  return new ProtocolException(status, {
    statusCode: status,
    message,
    error: REASONS[status],
  });
}
