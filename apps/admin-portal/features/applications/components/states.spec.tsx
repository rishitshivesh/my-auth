import { html } from "@/test-utils/render";
import { EndpointsPanel } from "./EndpointsPanel";
import { ClientsTable } from "./ClientsTable";

const noop = () => undefined;
const table = (status: "loading" | "error" | "denied" | "ready", search = "") =>
  html(<ClientsTable clients={[]} status={status} search={search} onSearchChange={noop} onRetry={noop} onOpen={noop} onCreate={noop} />);

describe("ClientsTable states", () => {
  it("announces loading politely", () => expect(table("loading")).toContain('role="status"'));
  it("announces errors assertively with retry", () => {
    const out = table("error");
    expect(out).toContain('role="alert"');
    expect(out).toContain("Try again");
  });
  it("shows denied without a retry", () => expect(table("denied")).toContain('data-state="denied"'));
  it("shows the empty state with a create action", () => {
    const out = table("ready");
    expect(out).toContain("No applications yet");
    expect(out).toContain("Add application");
  });
  it("shows the filtered-empty state when searching", () => expect(table("ready", "zz")).toContain("No applications match your search"));
});

describe("EndpointsPanel", () => {
  it("renders labelled copyable values", () => {
    const out = html(<EndpointsPanel heading="H" items={[{ id: "a", label: "Issuer", value: "https://x.test" }]} />);
    expect(out).toContain("https://x.test");
    expect(out).toContain("Copy Issuer");
  });
});
