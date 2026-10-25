"use client";

import type { QueryKeys } from "@/constants/query-keys";
import { accessApi } from "@/features/access/api/access-api";
import { useAccessMutation } from "@/features/access/api/use-access";
import { downloadTextFile } from "@/lib/download";
import { usersApi } from "./users-api";
import { exportQuery, type PeopleFilters } from "../model/list-query";
import type { BatchOutcome } from "../model/invites";
import type { InviteBody, UpdateUserBody } from "../model/types";

/** Lifecycle writes for people; each invalidates the scoped user keys it affects. */
export function useUserActions(slug: string) {
  const people = (k: QueryKeys) => [k.users.all()];
  const lock = useAccessMutation(slug, (id: string) => usersApi.lock(id), people);
  const unlock = useAccessMutation(slug, (id: string) => usersApi.unlock(id), people);
  const remove = useAccessMutation(slug, (id: string) => usersApi.remove(id), people);
  const forceReset = useAccessMutation(slug, (id: string) => usersApi.forcePasswordReset(id), people);
  const update = useAccessMutation(slug, (v: { id: string; body: UpdateUserBody }) => usersApi.update(v.id, v.body), people);
  const revokeSession = useAccessMutation(
    slug,
    (v: { id: string; sessionId: string }) => usersApi.revokeSession(v.id, v.sessionId),
    (k) => [k.sessions.all()],
  );
  const revokeInvite = useAccessMutation(slug, (id: string) => usersApi.revokeInvite(id), people);

  /** Sends invitations one by one so a single bad address never blocks the rest. */
  const invite = useAccessMutation(
    slug,
    async (v: { emails: readonly string[]; roleIds: string[]; expiresInDays: number }): Promise<BatchOutcome[]> => {
      const outcomes: BatchOutcome[] = [];
      for (const email of v.emails) {
        const body: InviteBody = { email, roleIds: v.roleIds.length > 0 ? v.roleIds : undefined, expiresInDays: v.expiresInDays };
        try {
          await usersApi.invite(body);
          outcomes.push({ email, ok: true });
        } catch (error) {
          outcomes.push({ email, ok: false, error: error instanceof Error ? error.message : String(error) });
        }
      }
      return outcomes;
    },
    people,
  );

  /**
   * TODO(gap:N10-resend): no resend endpoint. Resend = revoke then invite again; if the second
   * step fails the old link is already revoked, and the caller says so.
   */
  const resend = useAccessMutation(
    slug,
    async (v: { id: string; email: string; roleIds: string[]; expiresInDays: number }) => {
      await usersApi.revokeInvite(v.id);
      await usersApi.invite({ email: v.email, roleIds: v.roleIds.length > 0 ? v.roleIds : undefined, expiresInDays: v.expiresInDays });
    },
    people,
  );

  const assignRoles = useAccessMutation(
    slug,
    (v: { userId: string; roleNames: string[]; reason?: string; expiresAt?: string }) =>
      accessApi.assignUserRoles(v.userId, { roleNames: v.roleNames, reason: v.reason, expiresAt: v.expiresAt }),
    (k) => [k.users.all()],
  );
  const revokeRole = useAccessMutation(
    slug,
    (v: { userId: string; roleName: string }) => accessApi.revokeUserRole(v.userId, v.roleName),
    (k) => [k.users.all()],
  );

  const exportCsv = async (filters: PeopleFilters): Promise<void> => {
    const csv = await usersApi.exportCsv(exportQuery(filters));
    downloadTextFile(typeof csv === "string" ? csv : "", `people-${new Date().toISOString().slice(0, 10)}.csv`, "text/csv");
  };

  return { lock, unlock, remove, forceReset, update, revokeSession, revokeInvite, invite, resend, assignRoles, revokeRole, exportCsv };
}
