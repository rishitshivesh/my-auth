import { EventEmitter } from "events";
import * as ldapjs from "ldapjs";
import { ApiException } from "@/common/http";
import { LdapService } from "./ldap.service";

jest.mock("ldapjs", () => ({ createClient: jest.fn() }));
jest.mock("@/common/logger", () => ({
  logger: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const createClient = ldapjs.createClient as unknown as jest.Mock;
const MASTER = "ldap-master-key";

type Attr = { type: string; values: string[] };
interface FakeOpts {
  bindError?: Error | null;
  emitError?: Error;
  searchError?: Error;
  entries?: Array<{ objectName?: string; attributes: Attr[] }>;
  resError?: Error;
}

function fakeClient(o: FakeOpts = {}) {
  const client = new EventEmitter() as EventEmitter & {
    bind: jest.Mock; search: jest.Mock; destroy: jest.Mock;
  };
  client.destroy = jest.fn();
  client.bind = jest.fn((_dn: string, _pw: string, cb: (e: Error | null) => void) => {
    if (o.emitError) client.emit("error", o.emitError);
    else cb(o.bindError ?? null);
  });
  client.search = jest.fn((_b: string, _opts: unknown, cb: (e: Error | null, res?: EventEmitter) => void) => {
    if (o.searchError) return cb(o.searchError);
    const res = new EventEmitter();
    cb(null, res);
    for (const e of o.entries ?? []) res.emit("searchEntry", e);
    if (o.resError) res.emit("error", o.resError);
    else res.emit("end");
  });
  createClient.mockReturnValue(client);
  return client;
}

function build() {
  const connRepo = {
    create: jest.fn((v: object) => ({ id: "c1", ...v })),
    save: jest.fn((v: object) => Promise.resolve(v)),
    find: jest.fn(), findOne: jest.fn(), update: jest.fn(), softDelete: jest.fn(),
  };
  const userRepo = {
    find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), save: jest.fn((v: object) => Promise.resolve(v)),
    create: jest.fn((v: object) => v),
  };
  const config = {
    getOrThrow: (k: string) => { if (k === "KEYRING_MASTER_KEY") return MASTER; throw new Error(k); },
    get: (_k: string, d?: unknown) => d,
  };
  const sessions = { revokeOtherUserSessions: jest.fn().mockResolvedValue([]) };
  const events = { log: jest.fn() };
  return {
    service: new LdapService(connRepo as never, userRepo as never, config as never, sessions as never, events as never),
    connRepo, userRepo, sessions, events,
  };
}

const createDto = { name: "n", host: "h", bindDn: "cn=a", bindPassword: "pw", baseDn: "dc=x" } as never;

async function stored(service: LdapService, connRepo: ReturnType<typeof build>["connRepo"], pw = "s3cret") {
  await service.create("t1", { ...(createDto as object), bindPassword: pw } as never);
  const saved = connRepo.save.mock.calls.at(-1)?.[0] as { bindPasswordEncrypted: string };
  return { bindPasswordEncrypted: saved.bindPasswordEncrypted };
}

describe("LdapService CRUD and encryption", () => {
  beforeEach(() => createClient.mockReset());

  it("create applies defaults and never stores plaintext password", async () => {
    const { service, connRepo } = build();
    const conn = (await service.create("t1", createDto)) as unknown as Record<string, unknown>;
    expect(conn).toMatchObject({
      tenantId: "t1", port: 389, userFilter: "(objectClass=inetOrgPerson)", groupFilter: "(objectClass=groupOfNames)",
      emailAttribute: "mail", displayNameAttribute: "cn", firstNameAttribute: "givenName", lastNameAttribute: "sn",
      syncSchedule: "manual", useTls: true, active: true,
    });
    expect(JSON.stringify(connRepo.save.mock.calls)).not.toContain('"pw"');
    expect(conn.bindPasswordEncrypted).toMatch(/^[0-9a-f]{32}:[0-9a-f]{32}:[0-9a-f]+$/);
  });

  it.each(["127.0.0.1", "169.254.169.254", "::1"])("create refuses SSRF-prone host %s and saves nothing", async (host) => {
    const { service, connRepo } = build();
    await expect(service.create("t1", { ...(createDto as object), host } as never)).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(connRepo.save).not.toHaveBeenCalled();
  });

  it("create honours explicit options and uses a fresh IV each time", async () => {
    const { service } = build();
    const a = (await service.create("t1", { ...(createDto as object), port: 636, useTls: true, userFilter: "(x)" } as never)) as unknown as Record<string, unknown>;
    const b = (await service.create("t1", createDto)) as unknown as Record<string, unknown>;
    expect(a).toMatchObject({ port: 636, useTls: true, userFilter: "(x)" });
    expect(a.bindPasswordEncrypted).not.toBe(b.bindPasswordEncrypted);
  });

  it("list, findOne (tenant scoped), delete", async () => {
    const { service, connRepo } = build();
    connRepo.find.mockResolvedValue([]);
    await service.list("t1");
    expect(connRepo.find).toHaveBeenCalledWith({ where: { tenantId: "t1" }, order: { createdAt: "DESC" } });
    connRepo.findOne.mockResolvedValueOnce({ id: "c" });
    await service.delete("t1", "c");
    expect(connRepo.softDelete).toHaveBeenCalledWith("c");
    connRepo.findOne.mockResolvedValueOnce(null);
    await expect(service.findOne("t2", "c")).rejects.toMatchObject({ code: "RESOURCE_NOT_FOUND" });
    expect(connRepo.findOne).toHaveBeenLastCalledWith({ where: { id: "c", tenantId: "t2" } });
  });

  it("update re-encrypts new password and never persists plaintext field", async () => {
    const { service, connRepo } = build();
    const conn = { id: "c", bindPasswordEncrypted: "old", name: "a" };
    connRepo.findOne.mockResolvedValue(conn);
    const res = (await service.update("t1", "c", { name: "b", bindPassword: "newpw" } as never)) as unknown as Record<string, unknown>;
    expect(res.name).toBe("b");
    expect(res.bindPasswordEncrypted).not.toBe("old");
    expect(res).not.toHaveProperty("bindPassword");
  });

  it("update without password keeps ciphertext", async () => {
    const { service, connRepo } = build();
    connRepo.findOne.mockResolvedValue({ id: "c", bindPasswordEncrypted: "keep" });
    const res = (await service.update("t1", "c", { host: "h2" } as never)) as unknown as Record<string, unknown>;
    expect(res).toMatchObject({ bindPasswordEncrypted: "keep", host: "h2" });
  });
});

describe("LdapService.testConnection", () => {
  beforeEach(() => createClient.mockReset());

  async function run(opts: FakeOpts, overrides: Record<string, unknown> = {}) {
    const { service, connRepo } = build();
    const enc = await stored(service, connRepo, "the-pw");
    connRepo.findOne.mockResolvedValue({ id: "c", host: "ldap.test", port: 389, useTls: false, bindDn: "cn=a", ...enc, ...overrides });
    const client = fakeClient(opts);
    const res = await service.testConnection("t1", "c");
    return { res, client };
  }

  it("succeeds, decrypts password for bind and always destroys the client", async () => {
    const { res, client } = await run({});
    expect(res).toEqual({ success: true, message: "Connection successful" });
    expect(client.bind).toHaveBeenCalledWith("cn=a", "the-pw", expect.any(Function));
    expect(client.destroy).toHaveBeenCalled();
    expect(createClient.mock.calls[0]?.[0]).toMatchObject({ url: "ldap://ldap.test:389", connectTimeout: 5000 });
  });

  it("uses ldaps:// when useTls", async () => {
    await run({}, { useTls: true, port: 636 });
    expect(createClient.mock.calls[0]?.[0].url).toBe("ldaps://ldap.test:636");
  });

  it("reports bind failure", async () => {
    const { res, client } = await run({ bindError: new Error("Invalid Credentials") });
    expect(res).toEqual({ success: false, message: "Invalid Credentials" });
    expect(client.destroy).toHaveBeenCalled();
  });

  it("reports connection error event", async () => {
    const { res } = await run({ emitError: new Error("ECONNREFUSED") });
    expect(res).toEqual({ success: false, message: "ECONNREFUSED" });
  });

  it("throws INTERNAL_ERROR for corrupt ciphertext and for tampered auth tag", async () => {
    const { service, connRepo } = build();
    connRepo.findOne.mockResolvedValue({ id: "c", bindPasswordEncrypted: "nocolons" });
    await expect(service.testConnection("t1", "c")).rejects.toBeInstanceOf(ApiException);
    const enc = await stored(service, connRepo);
    const [iv, , data] = enc.bindPasswordEncrypted.split(":");
    connRepo.findOne.mockResolvedValue({ id: "c", bindPasswordEncrypted: `${iv}:${"00".repeat(16)}:${data}` });
    await expect(service.testConnection("t1", "c")).rejects.toThrow();
  });
});

describe("LdapService.syncNow", () => {
  beforeEach(() => createClient.mockReset());
  const entry = (email: string | undefined, extra: Record<string, string> = {}) => ({
    objectName: `uid=${email},dc=x`,
    attributes: [
      ...(email !== undefined ? [{ type: "mail", values: [email] }] : []),
      ...Object.entries(extra).map(([type, v]) => ({ type, values: [v] })),
    ],
  });

  async function setup(opts: FakeOpts, connOver: Record<string, unknown> = {}) {
    const fx = build();
    const enc = await stored(fx.service, fx.connRepo);
    fx.connRepo.findOne.mockResolvedValue({
      id: "c", active: true, host: "h", port: 389, useTls: false, bindDn: "cn=a", baseDn: "dc=x", userFilter: "(f)",
      emailAttribute: "mail", displayNameAttribute: "cn", firstNameAttribute: "givenName", lastNameAttribute: "sn",
      ...enc, ...connOver,
    });
    const client = fakeClient(opts);
    return { ...fx, client };
  }

  it("400s for inactive connection without opening a socket", async () => {
    const { service } = await setup({}, { active: false });
    createClient.mockClear();
    await expect(service.syncNow("t1", "c")).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("creates new users (verified, active) and updates existing, tracking counts", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-01-01T00:00:00Z"));
    try {
      const { service, userRepo, connRepo, client } = await setup({
        entries: [entry("new@x.test", { cn: "New", givenName: "N", sn: "U" }), entry("old@x.test", { cn: "Old" })],
      });
      const existing = { email: "old@x.test", displayName: "was", firstName: "keepF", lastName: "keepL" };
      userRepo.findOne.mockImplementation(({ where }: { where: { email: string } }) =>
        Promise.resolve(where.email === "old@x.test" ? existing : null));
      const res = await service.syncNow("t1", "c");
      expect(res).toEqual({ usersCreated: 1, usersUpdated: 1, usersDeactivated: 0, usersReactivated: 0, aborted: false, errors: [] });
      expect(userRepo.create).toHaveBeenCalledWith({
        tenantId: "t1", email: "new@x.test", displayName: "New", firstName: "N", lastName: "U", emailVerified: true, isActive: true,
        ldapConnectionId: "c",
      });
      expect(existing).toMatchObject({ displayName: "Old", firstName: "keepF", lastName: "keepL" });
      expect(connRepo.update).toHaveBeenCalledWith("c", {
        lastSyncAt: new Date(), lastSyncStatus: "success", lastSyncUsersCreated: 1, lastSyncUsersUpdated: 1,
      });
      expect(client.destroy).toHaveBeenCalled();
      expect(userRepo.findOne).toHaveBeenCalledWith({ where: { tenantId: "t1", email: "new@x.test" } });
    } finally {
      jest.useRealTimers();
    }
  });

  it("skips entries lacking email or with empty email", async () => {
    const { service, userRepo } = await setup({ entries: [entry(undefined, { cn: "NoMail" }), entry("")] });
    const res = await service.syncNow("t1", "c");
    expect(res).toMatchObject({ usersCreated: 0, usersUpdated: 0 });
    expect(userRepo.findOne).not.toHaveBeenCalled();
  });

  it("collects per-user errors without aborting the whole sync", async () => {
    const { service, userRepo } = await setup({ entries: [entry("a@x.test"), entry("b@x.test")] });
    userRepo.findOne.mockResolvedValue(null);
    userRepo.save.mockRejectedValueOnce(new Error("db down")).mockRejectedValueOnce("str");
    const res = await service.syncNow("t1", "c");
    expect(res.errors).toEqual(["Failed to sync a@x.test: db down", "Failed to sync b@x.test: str"]);
    expect(res.usersCreated).toBe(0);
  });

  it.each([
    ["bind failure", { bindError: new Error("bad creds") }],
    ["connect error", { emitError: new Error("ECONNREFUSED") }],
    ["search error", { searchError: new Error("no such object") }],
    ["stream error", { resError: new Error("stream") }],
  ])("%s marks sync failed and returns a generic INTERNAL_ERROR (no leakage)", async (_n, opts) => {
    const { service, connRepo, client } = await setup(opts);
    const err = await service.syncNow("t1", "c").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiException);
    expect((err as ApiException).code).toBe("INTERNAL_ERROR");
    expect((err as ApiException).detail).toBe("LDAP sync failed");
    expect(connRepo.update).toHaveBeenCalledWith("c", expect.objectContaining({ lastSyncStatus: "failed" }));
    expect(client.destroy).toHaveBeenCalled();
  });

  it("handles non-Error throw values and entries without objectName / empty attribute values", async () => {
    const { service, userRepo } = await setup({
      entries: [{ attributes: [{ type: "mail", values: ["z@x.test"] }, { type: "cn", values: [] }] }],
    });
    userRepo.findOne.mockResolvedValue(null);
    const res = await service.syncNow("t1", "c");
    expect(res.usersCreated).toBe(1);
    expect(userRepo.create).toHaveBeenCalledWith(expect.objectContaining({ displayName: "" }));
  });

  // ldap.service.ts testConnection/createLdapClient: tenant-supplied host/port are dialed with no private-IP/metadata filtering
  it("refuses to dial loopback / link-local hosts (SSRF via LDAP host)", async () => {
    const { service } = await setup({}, { host: "169.254.169.254" });
    createClient.mockClear();
    await service.testConnection("t1", "c").catch(() => undefined);
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("LdapService.syncNow deprovisioning", () => {
  beforeEach(() => createClient.mockReset());
  const entry = (email: string) => ({ objectName: `uid=${email},dc=x`, attributes: [{ type: "mail", values: [email] }] });
  const managed = (email: string, over: Record<string, unknown> = {}) => ({
    id: `id-${email}`, tenantId: "t1", email, isActive: true, ldapConnectionId: "c", ldapDeactivatedAt: null, ...over,
  });

  async function setup(directory: string[], provisioned: Array<ReturnType<typeof managed>>) {
    const fx = build();
    const enc = await stored(fx.service, fx.connRepo);
    fx.connRepo.findOne.mockResolvedValue({
      id: "c", active: true, host: "h", port: 389, useTls: false, bindDn: "cn=a", baseDn: "dc=x", userFilter: "(f)",
      emailAttribute: "mail", displayNameAttribute: "cn", firstNameAttribute: "givenName", lastNameAttribute: "sn", ...enc,
    });
    fx.userRepo.find.mockResolvedValue(provisioned);
    fx.userRepo.findOne.mockImplementation(({ where }: { where: { email: string } }) =>
      Promise.resolve(provisioned.find((u) => u.email === where.email) ?? null));
    fakeClient({ entries: directory.map(entry) });
    return fx;
  }
  const emails = (n: number) => Array.from({ length: n }, (_, i) => `u${i}@x.test`);

  it("deactivates (saves isActive=false, never deletes), revokes sessions and audits users that left", async () => {
    const all = emails(10);
    const users = all.map((e) => managed(e));
    const { service, userRepo, sessions, events, connRepo } = await setup(all.slice(1), users);
    const res = await service.syncNow("t1", "c");
    expect(res).toMatchObject({ usersDeactivated: 1, aborted: false });
    expect(users[0]).toMatchObject({ isActive: false });
    expect(users[0]!.ldapDeactivatedAt).toBeInstanceOf(Date);
    expect(userRepo.find).toHaveBeenCalledWith({ where: { tenantId: "t1", ldapConnectionId: "c" } });
    expect(sessions.revokeOtherUserSessions).toHaveBeenCalledWith("t1", users[0]!.id, undefined, "ldap_removed_from_directory");
    expect(events.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "ldap.user_deactivated", tenantId: "t1", userId: users[0]!.id }));
    expect(connRepo.update).toHaveBeenCalledWith("c", expect.objectContaining({ lastSyncStatus: "success" }));
  });

  it("only touches users provisioned by this connection (the query is scoped to it)", async () => {
    const { service, userRepo } = await setup(["a@x.test"], [managed("a@x.test")]);
    await service.syncNow("t1", "c");
    expect(userRepo.find).toHaveBeenCalledWith({ where: { tenantId: "t1", ldapConnectionId: "c" } });
  });

  it("reactivates a user it deactivated when they return, but not one an admin disabled", async () => {
    const back = managed("back@x.test", { isActive: false, ldapDeactivatedAt: new Date("2026-01-01") });
    const adminOff = managed("admin@x.test", { isActive: false });
    const { service, events } = await setup(["back@x.test", "admin@x.test"], [back, adminOff]);
    const res = await service.syncNow("t1", "c");
    expect(res).toMatchObject({ usersReactivated: 1, usersDeactivated: 0 });
    expect(back).toMatchObject({ isActive: true, ldapDeactivatedAt: null });
    expect(adminOff.isActive).toBe(false);
    expect(events.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "ldap.user_reactivated" }));
  });

  it("aborts without changing anything when the share to deactivate exceeds the limit", async () => {
    const all = emails(5);
    const users = all.map((e) => managed(e));
    const { service, userRepo, sessions, events, connRepo } = await setup(all.slice(0, 3), users);
    const res = await service.syncNow("t1", "c");
    expect(res).toMatchObject({ aborted: true, usersDeactivated: 0, usersCreated: 0, usersUpdated: 0 });
    expect(res.errors[0]).toMatch(/LDAP_MAX_DEACTIVATE_PERCENT/);
    expect(users.every((u) => u.isActive)).toBe(true);
    expect(userRepo.save).not.toHaveBeenCalled();
    expect(sessions.revokeOtherUserSessions).not.toHaveBeenCalled();
    expect(events.log).toHaveBeenCalledWith(expect.objectContaining({ eventType: "ldap.sync_aborted" }));
    expect(connRepo.update).toHaveBeenCalledWith("c", expect.objectContaining({ lastSyncStatus: "aborted" }));
  });

  it("treats exactly the limit as allowed and an empty directory as an abort", async () => {
    const all = emails(5);
    const atLimit = await setup(all.slice(1), all.map((e) => managed(e))); // 1 of 5 = 20%
    expect(await atLimit.service.syncNow("t1", "c")).toMatchObject({ aborted: false, usersDeactivated: 1 });
    const empty = await setup([], all.map((e) => managed(e)));
    expect(await empty.service.syncNow("t1", "c")).toMatchObject({ aborted: true });
  });

  it("matches directory emails case-insensitively", async () => {
    const users = [managed("Mixed@x.test")];
    const { service } = await setup(["mixed@x.test"], users);
    expect(await service.syncNow("t1", "c")).toMatchObject({ usersDeactivated: 0, aborted: false });
  });
});

