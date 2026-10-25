import { tenantRequest } from "@/lib/tenant-api";
import type {
  InviteBody, PendingInviteDto, SecurityEventDto, UpdateUserBody, UserDetailDto, UserListDto, UserSessionDto,
} from "../model/types";

const seg = encodeURIComponent;

export const usersApi = {
  list: (query: string) => tenantRequest<UserListDto>(`/users${query}`),
  detail: (id: string) => tenantRequest<UserDetailDto>(`/users/${seg(id)}`),
  update: (id: string, body: UpdateUserBody) => tenantRequest<unknown>(`/users/${seg(id)}`, "PUT", body),
  remove: (id: string) => tenantRequest<void>(`/users/${seg(id)}`, "DELETE"),
  /** "Suspend" and "reactivate" map to lock/unlock; the API takes no reason. */
  lock: (id: string) => tenantRequest<unknown>(`/users/${seg(id)}/lock`, "POST"),
  unlock: (id: string) => tenantRequest<unknown>(`/users/${seg(id)}/unlock`, "POST"),
  forcePasswordReset: (id: string) => tenantRequest<unknown>(`/users/${seg(id)}/force-password-reset`, "POST"),
  sessions: (id: string) => tenantRequest<UserSessionDto[]>(`/users/${seg(id)}/sessions`),
  revokeSession: (id: string, sessionId: string) =>
    tenantRequest<void>(`/users/${seg(id)}/sessions/${seg(sessionId)}`, "DELETE"),
  events: (id: string, limit = 50) => tenantRequest<SecurityEventDto[]>(`/users/${seg(id)}/security-events?limit=${limit}`),
  invites: () => tenantRequest<PendingInviteDto[]>("/users/invites"),
  invite: (body: InviteBody) => tenantRequest<unknown>("/users/invite", "POST", body),
  revokeInvite: (id: string) => tenantRequest<void>(`/users/invites/${seg(id)}`, "DELETE"),
  exportCsv: (query: string) => tenantRequest<string>(`/users/export${query}`),
};
