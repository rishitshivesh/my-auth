import {
  EMAIL_NAMES,
  isEmailName,
  renderEmail,
  toDisplayText,
  type EmailPropsByName,
} from "./index"
import { MAX_DISPLAY_LENGTH } from "./render"

const WHEN = "14 Oct 2026, 10:32 UTC"
const IP = "203.0.113.7"
const BASE = "https://sentry.example.com"

const SAMPLE: EmailPropsByName = {
  "verify-email": {
    name: "Alice",
    verifyUrl: `${BASE}/u/verify-email?token=tok_verify`,
    expiresInHours: 24,
  },
  "password-reset": {
    name: "Alice",
    resetUrl: `${BASE}/u/reset-password?token=tok_reset`,
    expiresInMinutes: 60,
  },
  "password-changed": { name: "Alice", when: WHEN, ip: IP },
  "session-reuse-alert": { name: "Alice", when: WHEN, ip: IP },
  "account-exists": {
    name: "Alice",
    signInUrl: `${BASE}/u/login`,
    resetUrl: `${BASE}/u/forgot-password`,
  },
  invitation: {
    inviterName: "Bob",
    tenantName: "Acme Studio",
    role: "member",
    acceptUrl: `${BASE}/invite/tok_invite`,
    expiresInDays: 7,
  },
  "otp-code": { name: "Alice", code: "482913", expiresInMinutes: 10 },
  "mfa-enabled": { name: "Alice", when: WHEN, ip: IP },
  "mfa-disabled": { name: "Alice", when: WHEN, ip: null },
  "ownership-transferred-from": {
    name: "Alice",
    tenantName: "Acme Studio",
    newOwnerName: "Bob",
    when: WHEN,
    ip: IP,
  },
  "ownership-transferred-to": {
    name: "Bob",
    tenantName: "Acme Studio",
    previousOwnerName: "Alice",
    when: WHEN,
    ip: IP,
  },
  "account-suspended": { name: "Alice" },
  "account-restored": { name: "Alice", signInUrl: `${BASE}/u/login` },
  "tenant-suspended": { name: "Alice", tenantName: "Acme Studio" },
  "tenant-restored": {
    name: "Alice",
    tenantName: "Acme Studio",
    signInUrl: `${BASE}/u/login`,
  },
  "sign-in-method-changed": {
    name: "Alice",
    method: "Google",
    action: "added",
    when: WHEN,
    ip: IP,
  },
  "account-deleted": { name: "Alice", purgeOn: "15 Nov 2026" },
  "tenant-deletion-scheduled": {
    name: "Alice",
    tenantName: "Acme Studio",
    deleteOn: "15 Nov 2026",
    cancelUrl: `${BASE}/u/login`,
  },
  "tenant-deletion-cancelled": {
    name: "Alice",
    tenantName: "Acme Studio",
    signInUrl: `${BASE}/u/login`,
  },
  "magic-link": {
    name: "Alice",
    magicLinkUrl: `${BASE}/u/magic-link?token=tok_magic`,
    expiresInMinutes: 15,
  },
  "account-locked": { name: "Alice", when: WHEN, ip: IP, unlockMinutes: 15 },
  "social-account-link-request": {
    name: "Alice",
    provider: "Google",
    confirmUrl: `${BASE}/u/link-account?token=tok_link`,
    expiresInMinutes: 30,
  },
  "passkey-added": { name: "Alice", when: WHEN, ip: IP },
  "passkey-removed": { name: "Alice", when: WHEN, ip: IP },
}

const render = <N extends keyof EmailPropsByName>(
  name: N,
  props: EmailPropsByName[N] = SAMPLE[name]
) => renderEmail(name, props)

const ALERTS = [
  "session-reuse-alert",
  "password-changed",
  "mfa-enabled",
  "mfa-disabled",
  "sign-in-method-changed",
  "passkey-added",
  "passkey-removed",
  "account-locked",
] as const

describe("renderEmail", () => {
  it("has a sample for every template", () => {
    expect(Object.keys(SAMPLE).sort()).toEqual([...EMAIL_NAMES].sort())
  })

  it.each(EMAIL_NAMES)("renders %s with a subject, html and text", async (name) => {
    const email = await renderEmail(name, SAMPLE[name] as never)

    expect(email.subject.length).toBeGreaterThan(5)
    expect(Array.from(email.subject).length).toBeLessThanOrEqual(120)
    expect(email.subject).not.toMatch(/[\r\n]/)
    expect(email.html).toContain("<html")
    expect(email.html).toContain("scrolloop")
    expect(email.text.length).toBeGreaterThan(20)
    expect(email.text).not.toContain("<")
    expect(email.html).not.toContain("undefined")
    expect(email.text).not.toContain("undefined")
  })

  it.each([
    ["verify-email", "tok_verify"],
    ["password-reset", "tok_reset"],
    ["invitation", "tok_invite"],
    ["magic-link", "tok_magic"],
    ["social-account-link-request", "tok_link"],
  ] as const)("%s carries its link in html and text", async (name, token) => {
    const email = await renderEmail(name, SAMPLE[name] as never)

    expect(email.html).toContain(token)
    expect(email.text).toContain(token)
  })

  it("puts the code in the subject and body of the otp email", async () => {
    const email = await render("otp-code")

    expect(email.subject).toContain("482913")
    expect(email.text).toContain("482913")
  })

  it("names the inviter and the tenant in the invitation subject", async () => {
    const email = await render("invitation")

    expect(email.subject).toBe("Bob invited you to Acme Studio on Scrolloop Sentry")
  })

  it("words a waitlist invitation as a new tenant, not a join", async () => {
    const email = await render("invitation", {
      ...SAMPLE.invitation,
      newTenant: true,
    })

    expect(email.subject).toBe("Your invitation to Scrolloop Sentry is ready")
    expect(email.text).toContain("own tenant")
    expect(email.text).not.toContain("as member")
  })

  it("names the tenant and the other person in the ownership emails", async () => {
    const from = await render("ownership-transferred-from")
    const to = await render("ownership-transferred-to")

    expect(from.subject).toBe("You transferred ownership of Acme Studio")
    expect(from.text).toContain("Bob")
    expect(from.text).toContain("admin")
    expect(to.subject).toBe("You are now the owner of Acme Studio")
    expect(to.text).toContain("Alice")
  })

  it("names the tenant in the tenant lifecycle subjects", async () => {
    expect((await render("tenant-suspended")).subject).toBe(
      "Acme Studio was suspended on Scrolloop Sentry"
    )
    expect((await render("tenant-restored")).subject).toBe(
      "Acme Studio was restored on Scrolloop Sentry"
    )
    expect((await render("tenant-deletion-cancelled")).subject).toBe(
      "Deletion of Acme Studio was cancelled"
    )
    const scheduled = await render("tenant-deletion-scheduled")
    expect(scheduled.subject).toBe("Acme Studio will be deleted on Scrolloop Sentry")
    expect(scheduled.text).toContain("15 Nov 2026")
    expect(scheduled.html).toContain(`${BASE}/u/login`)
  })

  it("gives no reason in the suspension emails", async () => {
    for (const name of ["account-suspended", "tenant-suspended"] as const) {
      const email = await renderEmail(name, SAMPLE[name] as never)
      expect(email.text.toLowerCase()).not.toContain("reason")
    }
  })

  it("says which sign-in method changed and how, in the subject", async () => {
    const added = await render("sign-in-method-changed")
    const removed = await render("sign-in-method-changed", {
      ...SAMPLE["sign-in-method-changed"],
      action: "removed",
      ip: null,
    })

    expect(added.subject).toBe(
      "Google sign-in was added on your Scrolloop Sentry account"
    )
    expect(added.text).toContain(IP)
    expect(removed.subject).toContain("removed")
    expect(removed.text).not.toContain(" from ")
  })

  it("tells a deleted account when its details are erased", async () => {
    expect((await render("account-deleted")).text).toContain("15 Nov 2026")
  })

  it("states the lock duration and source in the account-locked email", async () => {
    const email = await render("account-locked")

    expect(email.text).toContain("15 minutes")
    expect(email.text).toContain(IP)
  })

  it("names the provider in the social link request", async () => {
    const email = await render("social-account-link-request")

    expect(email.subject).toBe(
      "Confirm linking Google to your Scrolloop Sentry account"
    )
    expect(email.text).toContain("30 minutes")
  })

  it("says whether a passkey was added or removed", async () => {
    expect((await render("passkey-added")).subject).toContain("added")
    expect((await render("passkey-removed")).subject).toContain("removed")
  })

  it("omits the address line when the ip is unknown", async () => {
    const email = await render("password-changed", {
      ...SAMPLE["password-changed"],
      ip: null,
    })

    expect(email.text).not.toContain("from null")
    expect(email.text).not.toContain(" from ")
  })
})

describe("branding", () => {
  it("shows the Sentry wordmark with the second word muted and no remote images", async () => {
    const email = await render("password-changed")

    expect(email.html).toMatch(/scrolloop(?:<!-- -->)?\s*<span[^>]*>sentry<\/span>/)
    expect(email.html).not.toContain("<img")
    expect(email.text).not.toContain("http")
  })

  it("shows the tenant name in the header when given", async () => {
    const email = await render("magic-link", {
      ...SAMPLE["magic-link"],
      tenantName: "Globex",
    })

    expect(email.html).toContain("Globex")
  })

  it("replaces the wordmark with a brand name when given", async () => {
    const email = await render("magic-link", {
      ...SAMPLE["magic-link"],
      brandName: "Globex Auth",
    })

    expect(email.html).toContain("Globex Auth")
    expect(email.html).not.toMatch(/<span[^>]*>sentry<\/span>/)
  })

  it.each(EMAIL_NAMES)("%s uses the light theme", async (name) => {
    const email = await renderEmail(name, SAMPLE[name] as never)

    expect(email.html).toContain("background-color:#F7F6F4")
    expect(email.html).toContain("background-color:#FFFFFF")
    expect(email.html).toContain('name="color-scheme" content="light"')
  })

  it("colours the button mint and the links brand green", async () => {
    const email = await render("password-reset")

    expect(email.html).toMatch(/<a [^>]*style="[^"]*background-color:#2ABF6C/)
    expect(email.html).toMatch(/<a [^>]*style="[^"]*color:#1D8F50/)
  })
})

describe("security alert reference", () => {
  it.each(ALERTS)("%s shows the request id when given", async (name) => {
    const email = await renderEmail(name, {
      ...SAMPLE[name],
      requestId: "req_8f3a",
    } as never)

    expect(email.html).toContain("Reference: <!-- -->req_8f3a")
    expect(email.text).toContain("Reference: req_8f3a")
  })

  it.each(ALERTS)("%s shows no reference line without one", async (name) => {
    const email = await renderEmail(name, SAMPLE[name] as never)

    expect(email.text).not.toContain("Reference")
  })

  it("sanitises the request id", async () => {
    const email = await render("password-changed", {
      ...SAMPLE["password-changed"],
      requestId: "req_1\r\nBcc: x@evil.test",
    })

    expect(email.text).toContain("Reference: req_1 Bcc: x@evil.test")
    expect(email.html).not.toMatch(/req_1\r|req_1\n/)
  })
})

describe("sanitisation", () => {
  it("reduces the other person's name to one plain line", async () => {
    const email = await render("ownership-transferred-to", {
      ...SAMPLE["ownership-transferred-to"],
      previousOwnerName: "Mallory\r\nBcc: x@evil.test",
    })

    expect(email.html).not.toMatch(/Mallory\r|Mallory\n/)
    expect(email.text).toContain("Mallory Bcc: x@evil.test")
  })

  it("escapes hostile text instead of injecting markup", async () => {
    const email = await render("verify-email", {
      ...SAMPLE["verify-email"],
      name: '<script>alert("x")</script><img src=x onerror=y>',
    })

    expect(email.html).not.toContain("<script>")
    expect(email.html).not.toContain("<img src=x")
    expect(email.html).toContain("&lt;script&gt;")
  })

  it("keeps a subject on one line when a name contains line breaks", async () => {
    const email = await render("invitation", {
      ...SAMPLE.invitation,
      inviterName: "Bob\r\nBcc: x@example.com",
      tenantName: "Acme\nSubject: fake",
    })

    expect(email.subject).not.toMatch(/[\r\n]/)
    expect(email.subject).toBe(
      "Bob Bcc: x@example.com invited you to Acme Subject: fake on Scrolloop Sentry"
    )
  })

  it("strips bidi overrides and zero-width characters from names", async () => {
    const email = await render("verify-email", {
      ...SAMPLE["verify-email"],
      name: "Al‮ecil​x",
    })

    expect(email.html).toContain("Hi <!-- -->Al ecil x<!-- -->,")
    expect(email.text).toContain("Al ecil x")
  })

  it("cuts an over-long name so it cannot carry a fake message", async () => {
    const email = await render("verify-email", {
      ...SAMPLE["verify-email"],
      name: `Alice. Your account is locked, call 555-0100. ${"x".repeat(500)}`,
    })

    expect(email.text).not.toContain("x".repeat(100))
    expect(toDisplayText("y".repeat(500)).length).toBeLessThanOrEqual(
      MAX_DISPLAY_LENGTH
    )
  })

  it("bounds the subject length", async () => {
    const email = await render("invitation", {
      ...SAMPLE.invitation,
      inviterName: "B".repeat(500),
      tenantName: "T".repeat(500),
    })

    expect(Array.from(email.subject).length).toBeLessThanOrEqual(120)
  })
})

describe("url safety", () => {
  it.each([
    "javascript:alert(1)",
    "data:text/html,<b>x</b>",
    "/relative/path",
    "not a url",
  ])("refuses the link %s", async (url) => {
    await expect(
      render("verify-email", { ...SAMPLE["verify-email"], verifyUrl: url })
    ).rejects.toThrow(/verifyUrl/)
  })

  it.each([
    ["magic-link", "magicLinkUrl"],
    ["social-account-link-request", "confirmUrl"],
    ["tenant-deletion-scheduled", "cancelUrl"],
  ] as const)("refuses an unsafe %s link", async (name, key) => {
    await expect(
      renderEmail(name, { ...SAMPLE[name], [key]: "javascript:alert(1)" } as never)
    ).rejects.toThrow(new RegExp(key))
  })

  it("accepts plain http for local development", async () => {
    const email = await render("verify-email", {
      ...SAMPLE["verify-email"],
      verifyUrl: "http://localhost:3000/u/verify-email?token=t",
    })

    expect(email.text).toContain("localhost:3000")
  })
})

describe("isEmailName", () => {
  it("accepts template names and rejects everything else", () => {
    expect(isEmailName("verify-email")).toBe(true)
    expect(isEmailName("magic-link")).toBe(true)
    expect(isEmailName("workspace-suspended")).toBe(false)
    expect(isEmailName("toString")).toBe(false)
    expect(isEmailName(undefined)).toBe(false)
  })
})
