/** Response shapes of the OAuth client endpoints (apps/auth-service/src/modules/oauth). */

export type ClientType = "confidential" | "public";

export const GRANT_TYPES = ["authorization_code", "refresh_token", "client_credentials"] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

export interface OAuthClient {
  id: string;
  clientId: string;
  name: string;
  description?: string | null;
  clientType: ClientType | string;
  grantTypes: string[];
  redirectUris: string[];
  logoUrl?: string | null;
  isActive: boolean;
  createdAt?: string;
}

/** POST /oauth/clients; `clientSecret` is present once, for confidential clients only. */
export type CreatedOAuthClient = OAuthClient & { clientSecret?: string };

export interface CreateClientBody {
  name: string;
  description?: string;
  clientType: ClientType;
  grantTypes: string[];
  redirectUris: string[];
}

export interface UpdateClientBody {
  name?: string;
  description?: string;
  redirectUris?: string[];
  logoUrl?: string;
  isActive?: boolean;
}

export interface RotatedSecret {
  message?: string;
  clientSecret: string;
}
