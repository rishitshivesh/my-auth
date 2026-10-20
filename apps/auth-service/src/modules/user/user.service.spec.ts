import { UserService } from "./user.service";

function build(overrides: { lastOwner?: boolean; priorities?: Record<string, number> } = {}) {
  const user = { id: "u2", tenantId: "t1", email: "u2@x.io" };
  const userRepo = {
    findOne: jest.fn(async () => user),
    save: jest.fn(),
    isLastOwnerLevelHolder: jest.fn(async () => overrides.lastOwner ?? false),
    getMaxRolePriority: jest.fn(async (id: string) => overrides.priorities?.[id] ?? 0),
  };
  const sessions = { update: jest.fn() };
  const events = { log: jest.fn() };
  const email = { sendAccountDeletedEmail: jest.fn() };
  const service = new UserService(
    userRepo as never,
    sessions as never,
    {} as never,
    {} as never,
    {} as never,
    events as never,
    email as never,
    {} as never,
    {} as never,
  );
  return { service, userRepo, events, email };
}

describe("UserService admin deletion", () => {
  it("maps a missing user to RESOURCE_NOT_FOUND without detail", async () => {
    const { service, userRepo } = build();
    userRepo.findOne.mockResolvedValueOnce(null as never);
    await expect(service.adminDeleteUser("t1", "nope")).rejects.toMatchObject({
      code: "RESOURCE_NOT_FOUND",
      detail: undefined,
    });
  });

  it("refuses to delete the last owner", async () => {
    const { service, email } = build({ lastOwner: true });
    await expect(service.adminDeleteUser("t1", "u2")).rejects.toMatchObject({ code: "LAST_OWNER" });
    expect(email.sendAccountDeletedEmail).not.toHaveBeenCalled();
  });

  it("refuses when the actor does not outrank the target", async () => {
    const { service } = build({ priorities: { actor: 900, u2: 900 } });
    await expect(service.adminDeleteUser("t1", "u2", "actor")).rejects.toMatchObject({
      code: "HIERARCHY_VIOLATION",
    });
  });

  it("deletes, emails, and records the request id", async () => {
    const { service, events, email } = build({ priorities: { actor: 900, u2: 100 } });
    await service.adminDeleteUser("t1", "u2", "actor", "req-1");
    expect(email.sendAccountDeletedEmail).toHaveBeenCalled();
    expect(events.log).toHaveBeenCalledWith(expect.objectContaining({ requestId: "req-1" }));
  });
});
