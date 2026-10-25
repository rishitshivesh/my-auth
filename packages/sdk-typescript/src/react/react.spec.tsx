import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SentryClient } from "../core/client";
import { BASE, ok } from "../core/test-utils";
import { SentryProvider, shouldAdoptSession, useAccount, useCreateSentryClient, useSentryClient, useUser } from "./index";

const transport = async () => ok({});

describe("react layer", () => {
  it("useCreateSentryClient builds a separate client per tenant", () => {
    const seen: SentryClient[] = [];
    const Probe = ({ tenant }: { tenant: string }) => {
      seen.push(useCreateSentryClient({ baseURL: BASE, tenant, transport }));
      return null;
    };
    renderToString(<Probe tenant="a" />);
    renderToString(<Probe tenant="b" />);
    expect(seen[0]).not.toBe(seen[1]);
    expect(seen[0]?.getTenant()).toBe("a");
    expect(seen[1]?.getTenant()).toBe("b");
  });

  it("module hooks resolve to the provider's client modules", () => {
    const client = new SentryClient({ baseURL: BASE, tenant: "a", transport });
    let account: unknown;
    let same: unknown;
    const Probe = () => {
      account = useAccount();
      same = useSentryClient();
      return <span>{String(useUser().isLoading)}</span>;
    };
    const html = renderToString(
      <SentryProvider client={client}>
        <Probe />
      </SentryProvider>,
    );
    expect(account).toBe(client.account);
    expect(same).toBe(client);
    expect(html).toContain("true");
  });

  it("adopts a session established outside the provider only while nobody is shown", () => {
    expect(shouldAdoptSession(false, true)).toBe(true);
    expect(shouldAdoptSession(true, true)).toBe(false);
    expect(shouldAdoptSession(false, false)).toBe(false);
  });

  it("hooks throw outside a provider", () => {
    const Probe = () => {
      useAccount();
      return null;
    };
    expect(() => renderToString(<Probe />)).toThrow(/SentryProvider/);
  });
});
