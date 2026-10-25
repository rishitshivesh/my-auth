import type { ClientType, CreateClientBody, GrantType, OAuthClient, UpdateClientBody } from "./types";
import { isHttpUrl, parseLines, validateUriList, type UriIssue } from "./uri";

export interface CreateClientDraft {
  name: string;
  description: string;
  clientType: ClientType;
  redirectUris: string;
  grantTypes: readonly GrantType[];
}

export type CreateClientError =
  | { field: "name" }
  | { field: "redirectUris"; issue?: UriIssue }
  | { field: "grantTypes"; reason: "none" | "publicClientCredentials" };

export const EMPTY_CREATE_DRAFT: CreateClientDraft = {
  name: "",
  description: "",
  clientType: "confidential",
  redirectUris: "",
  grantTypes: ["authorization_code", "refresh_token"],
};

/** Public clients cannot hold a secret, so client_credentials is never offered to them. */
export function allowedGrants(type: ClientType): readonly GrantType[] {
  return type === "public"
    ? ["authorization_code", "refresh_token"]
    : ["authorization_code", "refresh_token", "client_credentials"];
}

export function withClientType(draft: CreateClientDraft, clientType: ClientType): CreateClientDraft {
  const allowed = allowedGrants(clientType);
  return { ...draft, clientType, grantTypes: draft.grantTypes.filter((g) => allowed.includes(g)) };
}

export function toggleGrant(draft: CreateClientDraft, grant: GrantType): CreateClientDraft {
  const has = draft.grantTypes.includes(grant);
  return { ...draft, grantTypes: has ? draft.grantTypes.filter((g) => g !== grant) : [...draft.grantTypes, grant] };
}

export function validateCreateDraft(draft: CreateClientDraft): CreateClientError[] {
  const errors: CreateClientError[] = [];
  if (draft.name.trim() === "") errors.push({ field: "name" });
  const uris = parseLines(draft.redirectUris);
  const needsRedirects = draft.grantTypes.some((g) => g === "authorization_code");
  if (needsRedirects && uris.length === 0) errors.push({ field: "redirectUris" });
  for (const issue of validateUriList(uris)) errors.push({ field: "redirectUris", issue });
  if (draft.grantTypes.length === 0) errors.push({ field: "grantTypes", reason: "none" });
  if (draft.clientType === "public" && draft.grantTypes.includes("client_credentials")) {
    errors.push({ field: "grantTypes", reason: "publicClientCredentials" });
  }
  return errors;
}

export function toCreateBody(draft: CreateClientDraft): CreateClientBody {
  const description = draft.description.trim();
  return {
    name: draft.name.trim(),
    ...(description ? { description } : {}),
    clientType: draft.clientType,
    grantTypes: [...draft.grantTypes],
    redirectUris: parseLines(draft.redirectUris),
  };
}

export interface EditClientDraft {
  name: string;
  description: string;
  redirectUris: string;
  logoUrl: string;
  isActive: boolean;
}

export type EditClientError = { field: "name" } | { field: "logoUrl" } | { field: "redirectUris"; issue?: UriIssue };

export function toEditDraft(client: OAuthClient): EditClientDraft {
  return {
    name: client.name,
    description: client.description ?? "",
    redirectUris: client.redirectUris.join("\n"),
    logoUrl: client.logoUrl ?? "",
    isActive: client.isActive,
  };
}

export function validateEditDraft(draft: EditClientDraft): EditClientError[] {
  const errors: EditClientError[] = [];
  if (draft.name.trim() === "") errors.push({ field: "name" });
  if (draft.logoUrl.trim() !== "" && !isHttpUrl(draft.logoUrl.trim())) errors.push({ field: "logoUrl" });
  for (const issue of validateUriList(parseLines(draft.redirectUris))) errors.push({ field: "redirectUris", issue });
  return errors;
}

export function isEditDirty(client: OAuthClient, draft: EditClientDraft): boolean {
  const base = toEditDraft(client);
  return (
    base.name !== draft.name ||
    base.description !== draft.description ||
    base.redirectUris !== draft.redirectUris ||
    base.logoUrl !== draft.logoUrl ||
    base.isActive !== draft.isActive
  );
}

/** Only changed fields are sent; the PUT DTO treats every field as optional. */
export function toUpdateBody(client: OAuthClient, draft: EditClientDraft): UpdateClientBody {
  const base = toEditDraft(client);
  const body: UpdateClientBody = {};
  if (base.name !== draft.name) body.name = draft.name.trim();
  if (base.description !== draft.description) body.description = draft.description.trim();
  if (base.redirectUris !== draft.redirectUris) body.redirectUris = parseLines(draft.redirectUris);
  if (base.logoUrl !== draft.logoUrl && draft.logoUrl.trim() !== "") body.logoUrl = draft.logoUrl.trim();
  if (base.isActive !== draft.isActive) body.isActive = draft.isActive;
  return body;
}
