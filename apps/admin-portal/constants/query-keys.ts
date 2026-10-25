/**
 * Query-key factory. Every key is scoped by tenant AND principal so cached
 * data can never leak across a workspace switch or a different signed-in
 * user. Use `queryKeys(scope).<domain>.<key>(...)`; invalidate by prefix with
 * `.all()` of a domain or `.scope()` for everything.
 */

export interface QueryScope {
  /** Tenant slug the data belongs to; "platform" for cross-tenant views. */
  tenant: string;
  /** Signed-in principal id (user id); "anonymous" before sign-in. */
  principal: string;
}

export const ANONYMOUS_PRINCIPAL = "anonymous";
export const PLATFORM_TENANT = "platform";

type KeyPart = string | number | boolean | null | undefined | Record<string, unknown>;

function domain(scope: QueryScope, name: string) {
  const root = ["scope", scope.tenant, scope.principal, name] as const;
  return {
    all: () => root,
    list: (filters?: Record<string, unknown>) => [...root, "list", filters ?? {}] as const,
    detail: (id: string) => [...root, "detail", id] as const,
    custom: (...parts: KeyPart[]) => [...root, ...parts] as const,
  };
}

export function queryKeys(scope: QueryScope) {
  return {
    scope: () => ["scope", scope.tenant, scope.principal] as const,
    users: domain(scope, "users"),
    roles: domain(scope, "roles"),
    groups: domain(scope, "groups"),
    policies: domain(scope, "policies"),
    permissions: domain(scope, "permissions"),
    clients: domain(scope, "clients"),
    connections: domain(scope, "connections"),
    webhooks: domain(scope, "webhooks"),
    audit: domain(scope, "audit"),
    sessions: domain(scope, "sessions"),
    branding: domain(scope, "branding"),
    settings: domain(scope, "settings"),
    tenants: domain(scope, "tenants"),
    mfa: domain(scope, "mfa"),
    workspaces: domain(scope, "workspaces"),
  } as const;
}

export type QueryKeys = ReturnType<typeof queryKeys>;
