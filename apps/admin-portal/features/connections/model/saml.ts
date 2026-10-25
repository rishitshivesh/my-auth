import { isHttpUrl } from "@/features/applications/model/uri";
import type { RegisterSamlBody, SamlServiceProvider } from "./types";

export interface SamlDraft {
  name: string;
  entityId: string;
  acsUrl: string;
  sloUrl: string;
  metadataUrl: string;
  certificate: string;
}

export const EMPTY_SAML_DRAFT: SamlDraft = {
  name: "", entityId: "", acsUrl: "", sloUrl: "", metadataUrl: "", certificate: "",
};

export type SamlError = "name" | "entityId" | "acsUrl" | "sloUrl" | "metadataUrl";

export function validateSamlDraft(draft: SamlDraft): SamlError[] {
  const errors: SamlError[] = [];
  if (draft.name.trim() === "") errors.push("name");
  if (draft.entityId.trim() === "") errors.push("entityId");
  if (!isHttpUrl(draft.acsUrl.trim())) errors.push("acsUrl");
  if (draft.sloUrl.trim() !== "" && !isHttpUrl(draft.sloUrl.trim())) errors.push("sloUrl");
  if (draft.metadataUrl.trim() !== "" && !isHttpUrl(draft.metadataUrl.trim())) errors.push("metadataUrl");
  return errors;
}

export function toSamlBody(draft: SamlDraft): RegisterSamlBody {
  const trimmed = (value: string) => value.trim();
  const optional = (key: "sloUrl" | "metadataUrl" | "certificate") =>
    trimmed(draft[key]) === "" ? {} : { [key]: trimmed(draft[key]) };
  return {
    name: trimmed(draft.name),
    entityId: trimmed(draft.entityId),
    acsUrl: trimmed(draft.acsUrl),
    ...optional("sloUrl"),
    ...optional("metadataUrl"),
    ...optional("certificate"),
  };
}

export function filterSamlProviders(rows: readonly SamlServiceProvider[], search: string): SamlServiceProvider[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") return [...rows];
  return rows.filter((r) => r.name.toLowerCase().includes(needle) || r.entityId.toLowerCase().includes(needle));
}
