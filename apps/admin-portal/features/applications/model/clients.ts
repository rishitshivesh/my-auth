import type { OAuthClient } from "./types";

/** Case-insensitive match on name or client ID. */
export function filterClients(clients: readonly OAuthClient[], search: string): OAuthClient[] {
  const needle = search.trim().toLowerCase();
  if (needle === "") return [...clients];
  return clients.filter(
    (c) => c.name.toLowerCase().includes(needle) || c.clientId.toLowerCase().includes(needle),
  );
}

export function isConfidential(client: Pick<OAuthClient, "clientType">): boolean {
  return client.clientType === "confidential";
}
