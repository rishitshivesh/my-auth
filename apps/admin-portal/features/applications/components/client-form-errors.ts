import { t } from "@/i18n";
import type { CreateClientError, EditClientError } from "../model/client-form";
import type { UriIssue } from "../model/uri";

export function uriIssueMessage(issue: UriIssue): string {
  const key = {
    invalid: "tenantIntegrations.apps.create.invalidUri",
    insecure: "tenantIntegrations.apps.create.insecureUri",
    duplicate: "tenantIntegrations.apps.create.duplicateUri",
  } as const;
  return t(key[issue.kind], { uri: issue.uri });
}

function uriMessage(errors: readonly { field: string; issue?: UriIssue }[]): string | undefined {
  const redirects = errors.filter((e) => e.field === "redirectUris");
  const first = redirects[0];
  if (!first) return undefined;
  return first.issue ? uriIssueMessage(first.issue) : t("tenantIntegrations.apps.create.redirectsRequired");
}

export interface CreateFieldMessages {
  name?: string;
  redirectUris?: string;
  grantTypes?: string;
}

export function createFieldMessages(errors: readonly CreateClientError[]): CreateFieldMessages {
  const grant = errors.find((e) => e.field === "grantTypes");
  return {
    name: errors.some((e) => e.field === "name") ? t("tenantIntegrations.apps.create.nameRequired") : undefined,
    redirectUris: uriMessage(errors),
    grantTypes: grant && grant.field === "grantTypes"
      ? t(grant.reason === "none" ? "tenantIntegrations.apps.create.grantsRequired" : "tenantIntegrations.apps.create.publicGrant")
      : undefined,
  };
}

export interface EditFieldMessages {
  name?: string;
  logoUrl?: string;
  redirectUris?: string;
}

export function editFieldMessages(errors: readonly EditClientError[]): EditFieldMessages {
  return {
    name: errors.some((e) => e.field === "name") ? t("tenantIntegrations.apps.create.nameRequired") : undefined,
    logoUrl: errors.some((e) => e.field === "logoUrl") ? t("tenantIntegrations.common.invalidUrl") : undefined,
    redirectUris: uriMessage(errors),
  };
}
