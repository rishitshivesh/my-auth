/** Test helpers: a scripted transport and response builders. Not exported from the package. */
import { vi } from "vitest";
import { SentryClient } from "./client";
import type { Transport, TransportRequest, TransportResponse } from "./types";

export const BASE = "https://auth.test";

export const ok = (data: unknown, status = 200): TransportResponse => ({
  ok: true,
  status,
  statusText: "OK",
  headers: {},
  data,
});

/** API success envelope as the ResponseInterceptor produces it. */
export const envelope = (data: unknown, status = 200): TransportResponse =>
  ok({ status, data }, status);

export const problem = (
  status: number,
  code: string,
  title = "Problem",
  extra: Record<string, unknown> = {},
): TransportResponse => ({
  ok: false,
  status,
  statusText: title,
  headers: { "x-request-id": "req_1" },
  data: { type: `urn:scrolloop:problem:${code}`, title, status, code, requestId: "req_1", ...extra },
});

/**
 * Transport that records every call and answers from the supplied handler.
 */
export function scriptedTransport(
  handler: (req: TransportRequest) => TransportResponse | Promise<TransportResponse>,
): { transport: Transport; calls: TransportRequest[] } {
  const calls: TransportRequest[] = [];
  const transport: Transport = async (req) => {
    calls.push(req);
    return handler(req);
  };
  return { transport: vi.fn(transport) as unknown as Transport, calls };
}

export async function makeClient(
  handler: (req: TransportRequest) => TransportResponse | Promise<TransportResponse>,
  config: Partial<ConstructorParameters<typeof SentryClient>[0]> = {},
) {
  let booting = true;
  const { transport, calls } = scriptedTransport((req) =>
    booting ? problem(401, "AUTH_TOKEN_INVALID", "No session") : handler(req),
  );
  const client = new SentryClient({ baseURL: BASE, tenant: "acme", transport, maxRefreshRetries: 1, ...config });
  await client.waitForInit();
  booting = false;
  calls.length = 0;
  return { client, calls, last: () => calls[calls.length - 1] as TransportRequest };
}
