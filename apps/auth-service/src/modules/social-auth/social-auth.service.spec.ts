import { SocialAuthService, type SocialProfile } from "./social-auth.service";

const TENANT = "tenant-1";

function profile(overrides: Partial<SocialProfile> = {}): SocialProfile {
  return {
    provider: "google",
    providerId: "g-1",
    email: "victim@example.com",
    emailVerified: true,
    accessToken: "at",
    ...overrides,
  } as SocialProfile;
}

function build(existingUser: Record<string, unknown> | null) {
  const connections = { findOne: jest.fn().mockResolvedValue(null), save: jest.fn(), update: jest.fn() };
  const users = {
    findOne: jest.fn().mockResolvedValue(existingUser),
    save: jest.fn(),
    update: jest.fn(),
  };
  const linkRequests = { save: jest.fn(), findOne: jest.fn(), update: jest.fn() };
  const email = { sendAccountLinkRequest: jest.fn() };
  const events = { log: jest.fn() };
  const encryption = { encryptTokens: jest.fn().mockReturnValue({ accessToken: "enc", refreshToken: undefined }) };

  const service = new SocialAuthService(
    users as never,
    connections as never,
    {} as never,
    linkRequests as never,
    events as never,
    encryption as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    email as never,
  );
  return { service, users, connections, linkRequests, email, events };
}

describe("SocialAuthService account linking", () => {
  const ipAddress = "203.0.113.1";
  const userAgent = "jest";

  it("never auto-links to an existing account: it sends the link-request email", async () => {
    const { service, connections, linkRequests, email } = build({ id: "u1", tenantId: TENANT, emailVerified: true });

    const result = await service.handleCallback({ tenantId: TENANT, profile: profile(), ipAddress, userAgent });

    expect(result.type).toBe("link_required");
    expect(connections.save).not.toHaveBeenCalled();
    expect(linkRequests.save).toHaveBeenCalledTimes(1);
    expect(email.sendAccountLinkRequest).toHaveBeenCalledTimes(1);
  });

  it("also requires the email flow for an unverified local account", async () => {
    const { service, connections, email } = build({ id: "u1", tenantId: TENANT, emailVerified: false });

    const result = await service.handleCallback({ tenantId: TENANT, profile: profile(), ipAddress, userAgent });

    expect(result.type).toBe("link_required");
    expect(connections.save).not.toHaveBeenCalled();
    expect(email.sendAccountLinkRequest).toHaveBeenCalled();
  });

  it("refuses to link when the provider has not verified the email", async () => {
    const { service, linkRequests } = build({ id: "u1", tenantId: TENANT, emailVerified: true });

    await expect(
      service.handleCallback({ tenantId: TENANT, profile: profile({ emailVerified: false }), ipAddress, userAgent }),
    ).rejects.toMatchObject({ code: "SOCIAL_PROVIDER_ERROR" });
    expect(linkRequests.save).not.toHaveBeenCalled();
  });

  describe("confirmLinking", () => {
    function request(emailVerified: boolean) {
      return {
        id: "lr1",
        tenantId: TENANT,
        userId: "u1",
        provider: "google",
        providerId: "g-1",
        providerEmail: "victim@example.com",
        isExpired: false,
        profileData: { accessToken: "enc" },
        user: { id: "u1", emailVerified },
      };
    }

    it("drops the password of a never-verified account (pre-registration takeover)", async () => {
      const { service, users, linkRequests, events } = build(null);
      linkRequests.findOne.mockResolvedValue(request(false));

      await service.confirmLinking("tok");

      expect(users.update).toHaveBeenCalledWith(
        "u1",
        expect.objectContaining({ emailVerified: true, passwordHash: expect.any(Function) }),
      );
      expect(events.log).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ reclaimedUnverified: true }) }),
      );
    });

    it("leaves a verified account's password alone", async () => {
      const { service, users, linkRequests } = build(null);
      linkRequests.findOne.mockResolvedValue(request(true));

      await service.confirmLinking("tok");

      expect(users.update).not.toHaveBeenCalled();
    });

    it("rejects unknown tokens with AUTH_TOKEN_INVALID", async () => {
      const { service, linkRequests } = build(null);
      linkRequests.findOne.mockResolvedValue(null);

      await expect(service.confirmLinking("nope")).rejects.toMatchObject({ code: "AUTH_TOKEN_INVALID" });
    });
  });
});
