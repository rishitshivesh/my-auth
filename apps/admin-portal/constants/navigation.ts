import {
  Activity, AppWindow, BookOpen, Building2, FileClock, Fingerprint, Globe, KeyRound, LayoutDashboard,
  Link2, LockKeyhole, Palette, Plug, ScrollText, Settings, ShieldCheck, User, UserCog,
  UsersRound, Users, Webhook, type LucideIcon,
} from "lucide-react";
import type { CopyKey } from "@/i18n";
import { accountRoutes, platformRoutes, tenantRoutes } from "./routes";
import type { CapabilityId } from "./feature-flags";

export interface NavEntry {
  id: string;
  href: string;
  icon: LucideIcon;
  labelKey: CopyKey;
  /** Section heading key; entries sharing a section are grouped. */
  sectionKey?: CopyKey;
  /** Permission needed to SEE the entry (UI hint only; backend enforces). */
  permission?: string;
  /** Present when the destination is a proposed capability. */
  capability?: CapabilityId;
}

export function tenantNav(slug: string): readonly NavEntry[] {
  const r = tenantRoutes(slug);
  const s = (k: string) => `tenant.shell.sections.${k}` as CopyKey;
  return [
    { id: "dashboard", href: r.dashboard(), icon: LayoutDashboard, labelKey: "tenant.shell.nav.dashboard", sectionKey: s("overview") },
    { id: "users", href: r.users(), icon: Users, labelKey: "tenant.shell.nav.users", sectionKey: s("access"), permission: "users:read" },
    { id: "roles", href: r.roles(), icon: ShieldCheck, labelKey: "tenant.shell.nav.roles", sectionKey: s("access"), permission: "roles:read" },
    { id: "groups", href: r.groups(), icon: UsersRound, labelKey: "tenant.shell.nav.groups", sectionKey: s("access"), capability: "groups" },
    { id: "policies", href: r.policies(), icon: ScrollText, labelKey: "tenant.shell.nav.policies", sectionKey: s("access"), permission: "policies:read" },
    { id: "applications", href: r.applications(), icon: AppWindow, labelKey: "tenant.shell.nav.applications", sectionKey: s("applications"), permission: "clients:read" },
    { id: "connections", href: r.connections(), icon: Plug, labelKey: "tenant.shell.nav.connections", sectionKey: s("connections") },
    { id: "saml", href: r.saml(), icon: KeyRound, labelKey: "tenant.shell.nav.saml", sectionKey: s("connections") },
    { id: "scim", href: r.scim(), icon: Link2, labelKey: "tenant.shell.nav.scim", sectionKey: s("connections") },
    { id: "ldap", href: r.ldap(), icon: BookOpen, labelKey: "tenant.shell.nav.ldap", sectionKey: s("connections") },
    { id: "webhooks", href: r.webhooks(), icon: Webhook, labelKey: "tenant.shell.nav.webhooks", sectionKey: s("monitor") },
    { id: "audit", href: r.audit(), icon: FileClock, labelKey: "tenant.shell.nav.audit", sectionKey: s("monitor"), permission: "audit:read" },
    { id: "branding", href: r.branding(), icon: Palette, labelKey: "tenant.shell.nav.branding", sectionKey: s("settings") },
    { id: "domains", href: r.domains(), icon: Globe, labelKey: "tenant.shell.nav.domains", sectionKey: s("settings"), capability: "domains" },
    { id: "settings", href: r.settings(), icon: Settings, labelKey: "tenant.shell.nav.settings", sectionKey: s("settings") },
  ];
}

export function platformNav(): readonly NavEntry[] {
  const s = (k: string) => `platform.shell.sections.${k}` as CopyKey;
  return [
    { id: "dashboard", href: platformRoutes.dashboard(), icon: LayoutDashboard, labelKey: "platform.shell.nav.dashboard", sectionKey: s("operate") },
    { id: "tenants", href: platformRoutes.tenants(), icon: Building2, labelKey: "platform.shell.nav.tenants", sectionKey: s("operate") },
    { id: "people", href: platformRoutes.people(), icon: UserCog, labelKey: "platform.shell.nav.people", sectionKey: s("govern") },
    { id: "audit", href: platformRoutes.audit(), icon: FileClock, labelKey: "platform.shell.nav.audit", sectionKey: s("govern") },
    { id: "settings", href: platformRoutes.settings(), icon: Settings, labelKey: "platform.shell.nav.settings", sectionKey: s("configure") },
  ];
}

export function accountNav(): readonly NavEntry[] {
  return [
    { id: "overview", href: accountRoutes.overview(), icon: LayoutDashboard, labelKey: "account.shell.nav.overview" },
    { id: "profile", href: accountRoutes.profile(), icon: User, labelKey: "account.shell.nav.profile" },
    { id: "security", href: accountRoutes.security(), icon: Fingerprint, labelKey: "account.shell.nav.security" },
    { id: "activity", href: accountRoutes.activity(), icon: Activity, labelKey: "account.shell.nav.activity", capability: "personalActivity" },
    { id: "workspaces", href: accountRoutes.applications(), icon: LockKeyhole, labelKey: "account.shell.nav.workspaces" },
  ];
}
