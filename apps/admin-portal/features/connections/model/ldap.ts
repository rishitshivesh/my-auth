import type { CreateLdapBody, LdapConnection } from "./types";

export const LDAP_DEFAULT_PORT = 389;
export const LDAP_TLS_PORT = 636;
export const MAX_PORT = 65535;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

export interface LdapDraft {
  name: string;
  host: string;
  port: string;
  useTls: boolean;
  bindDn: string;
  bindPassword: string;
  baseDn: string;
  userFilter: string;
  groupFilter: string;
  emailAttribute: string;
  syncSchedule: string;
}

export const EMPTY_LDAP_DRAFT: LdapDraft = {
  name: "", host: "", port: String(LDAP_DEFAULT_PORT), useTls: false, bindDn: "", bindPassword: "",
  baseDn: "", userFilter: "", groupFilter: "", emailAttribute: "", syncSchedule: "",
};

export type LdapError = "name" | "host" | "port" | "bindDn" | "bindPassword" | "baseDn" | "controlChars";

/** Switching TLS moves the port only while it is still the other protocol's default. */
export function withTls(draft: LdapDraft, useTls: boolean): LdapDraft {
  const wasDefault = draft.port === String(useTls ? LDAP_DEFAULT_PORT : LDAP_TLS_PORT);
  return { ...draft, useTls, port: wasDefault ? String(useTls ? LDAP_TLS_PORT : LDAP_DEFAULT_PORT) : draft.port };
}

export function validateLdapDraft(draft: LdapDraft): LdapError[] {
  const errors: LdapError[] = [];
  if (draft.name.trim() === "") errors.push("name");
  if (draft.host.trim() === "") errors.push("host");
  const port = Number(draft.port);
  if (!Number.isInteger(port) || port < 1 || port > MAX_PORT) errors.push("port");
  if (draft.bindDn.trim() === "") errors.push("bindDn");
  if (draft.bindPassword === "") errors.push("bindPassword");
  if (draft.baseDn.trim() === "") errors.push("baseDn");
  if (CONTROL_CHARS.test(draft.userFilter) || CONTROL_CHARS.test(draft.groupFilter)) errors.push("controlChars");
  return errors;
}

export function toLdapBody(draft: LdapDraft): CreateLdapBody {
  const opt = (key: "userFilter" | "groupFilter" | "emailAttribute" | "syncSchedule") =>
    draft[key].trim() === "" ? {} : { [key]: draft[key].trim() };
  return {
    name: draft.name.trim(),
    host: draft.host.trim(),
    port: Number(draft.port),
    useTls: draft.useTls,
    bindDn: draft.bindDn.trim(),
    bindPassword: draft.bindPassword,
    baseDn: draft.baseDn.trim(),
    ...opt("userFilter"), ...opt("groupFilter"), ...opt("emailAttribute"), ...opt("syncSchedule"),
  };
}

export function filterLdap(rows: readonly LdapConnection[], search: string): LdapConnection[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") return [...rows];
  return rows.filter((r) => r.name.toLowerCase().includes(needle) || r.host.toLowerCase().includes(needle));
}

export type SyncState = "never" | "ok" | "failed";

export function syncState(conn: Pick<LdapConnection, "lastSyncAt" | "lastSyncStatus">): SyncState {
  if (!conn.lastSyncAt) return "never";
  const status = (conn.lastSyncStatus ?? "").toLowerCase();
  return status === "failed" || status === "error" || status === "aborted" ? "failed" : "ok";
}
