// SCIM 2.0 resource types and schemas

export const SCIM_SCHEMA_USER = "urn:ietf:params:scim:schemas:core:2.0:User";
export const SCIM_SCHEMA_GROUP = "urn:ietf:params:scim:schemas:core:2.0:Group";
export const SCIM_SCHEMA_LIST = "urn:ietf:params:scim:api:messages:2.0:ListResponse";
export const SCIM_SCHEMA_ERROR = "urn:ietf:params:scim:api:messages:2.0:Error";

export interface ScimName {
  formatted?: string;
  givenName?: string;
  familyName?: string;
}

export interface ScimEmail {
  value: string;
  primary?: boolean;
  type?: string;
}

export interface ScimUser {
  schemas: string[];
  id?: string;
  externalId?: string;
  userName: string;
  name?: ScimName;
  emails?: ScimEmail[];
  displayName?: string;
  active?: boolean;
  meta?: ScimMeta;
}

export interface ScimGroupMember {
  value: string;
  display?: string;
}

export interface ScimGroup {
  schemas: string[];
  id?: string;
  externalId?: string;
  displayName: string;
  members?: ScimGroupMember[];
  meta?: ScimMeta;
}

export interface ScimMeta {
  resourceType: string;
  created?: string;
  lastModified?: string;
  location?: string;
}

export interface ScimListResponse<T> {
  schemas: string[];
  totalResults: number;
  startIndex: number;
  itemsPerPage: number;
  Resources: T[];
}

export interface ScimError {
  schemas: string[];
  status: string;
  detail: string;
  scimType?: string;
}

export interface ScimPatchOp {
  op: "add" | "remove" | "replace";
  path?: string;
  value?: unknown;
}

export interface ScimPatchRequest {
  schemas: string[];
  Operations: ScimPatchOp[];
}
