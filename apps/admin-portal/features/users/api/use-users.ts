"use client";

import { useQuery } from "@tanstack/react-query";
import { useScopedKeys } from "@/features/access/api/use-scope";
import { usersApi } from "./users-api";
import { toUsersQuery, type PeopleFilters } from "../model/list-query";

export function useUsersList(slug: string, filters: PeopleFilters) {
  const keys = useScopedKeys(slug);
  const query = toUsersQuery(filters);
  return useQuery({
    queryKey: keys.users.list({ ...filters }),
    queryFn: () => usersApi.list(query),
    placeholderData: (previous) => previous,
  });
}

export function useUserDetail(slug: string, userId: string) {
  const keys = useScopedKeys(slug);
  return useQuery({ queryKey: keys.users.detail(userId), queryFn: () => usersApi.detail(userId) });
}

export function useUserSessions(slug: string, userId: string, enabled: boolean) {
  const keys = useScopedKeys(slug);
  return useQuery({
    queryKey: keys.sessions.custom(userId),
    queryFn: () => usersApi.sessions(userId),
    enabled,
  });
}

export function useUserEvents(slug: string, userId: string, enabled: boolean) {
  const keys = useScopedKeys(slug);
  return useQuery({
    queryKey: keys.audit.custom("user", userId),
    queryFn: () => usersApi.events(userId),
    enabled,
  });
}

export function useInvites(slug: string, enabled = true) {
  const keys = useScopedKeys(slug);
  return useQuery({ queryKey: keys.users.custom("invites"), queryFn: usersApi.invites, enabled });
}

const DIRECTORY_LIMIT = 100;

/**
 * Searchable slice of the directory used to name group members and pick people to add.
 * TODO(gap:T08-member-lookup): the group API returns user ids only; names resolve from the
 * first page of people and fall back to the id for anyone beyond it.
 */
export function useUserDirectory(slug: string, search: string, enabled = true) {
  const keys = useScopedKeys(slug);
  const term = search.trim();
  return useQuery({
    queryKey: keys.users.custom("directory", term),
    queryFn: () => usersApi.list(toUsersQuery({ search: term, status: "all", page: 1 }, DIRECTORY_LIMIT)),
    enabled,
    staleTime: 30_000,
  });
}
