import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { logger } from "@/common/logger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OAuthClient } from "@repo/database";
import { PasswordService } from "@repo/security";
import * as crypto from "crypto";

export interface CreateClientDto {
  tenantId: string;
  name: string;
  description?: string;
  logoUrl?: string;
  websiteUrl?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  clientType: "confidential" | "public";
  grantTypes: string[];
  redirectUris: string[];
  postLogoutRedirectUris?: string[];
  allowedOrigins?: string[];
  allowedScopes?: string[];
  defaultScopes?: string[];
  requirePkce?: boolean;
  requireConsent?: boolean;
  isFirstParty?: boolean;
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  idTokenTtl?: number;
  metadata?: Record<string, any>;
  createdBy?: string;
}

export interface UpdateClientDto {
  name?: string;
  description?: string;
  logoUrl?: string;
  websiteUrl?: string;
  privacyPolicyUrl?: string;
  termsOfServiceUrl?: string;
  grantTypes?: string[];
  redirectUris?: string[];
  postLogoutRedirectUris?: string[];
  allowedOrigins?: string[];
  allowedScopes?: string[];
  defaultScopes?: string[];
  requirePkce?: boolean;
  requireConsent?: boolean;
  isActive?: boolean;
  accessTokenTtl?: number;
  refreshTokenTtl?: number;
  idTokenTtl?: number;
  metadata?: Record<string, any>;
}

@Injectable()
export class OAuthClientService {
  constructor(
    @InjectRepository(OAuthClient)
    private clientRepository: Repository<OAuthClient>,
    private passwordService: PasswordService,
  ) {}

  /**
   * Create new OAuth client
   * Returns client with plaintext secret (only time it's visible)
   */
  async createClient(data: CreateClientDto): Promise<{
    client: OAuthClient;
    clientSecret?: string;
  }> {
    // Validate grant types
    const validGrantTypes = [
      "authorization_code",
      "refresh_token",
      "client_credentials",
      "password", // Optional, legacy
    ];

    const invalidGrants = data.grantTypes.filter(
      (g) => !validGrantTypes.includes(g),
    );
    if (invalidGrants.length > 0) {
      throw new BadRequestException(
        `Invalid grant types: ${invalidGrants.join(", ")}`,
      );
    }

    // Validate redirect URIs for authorization_code grant
    if (data.grantTypes.includes("authorization_code")) {
      if (!data.redirectUris || data.redirectUris.length === 0) {
        throw new BadRequestException(
          "redirect_uris required for authorization_code grant",
        );
      }

      // Validate URIs
      for (const uri of data.redirectUris) {
        try {
          const url = new URL(uri);
          // Allow localhost for development
          const isLocalhost =
            url.hostname === "localhost" || url.hostname === "127.0.0.1";
          const isHttps = url.protocol === "https:";

          if (!isHttps && !isLocalhost) {
            throw new BadRequestException(
              `Redirect URI must use HTTPS: ${uri}`,
            );
          }
        } catch (error) {
          throw new BadRequestException(`Invalid redirect URI: ${uri}`);
        }
      }
    }

    // Generate client ID
    const clientId = `${data.isFirstParty ? "sentry" : "client"}_${crypto.randomBytes(16).toString("hex")}`;

    // Generate client secret (for confidential clients)
    let clientSecret: string | undefined;
    let clientSecretHash: string | undefined;

    if (data.clientType === "confidential") {
      clientSecret = crypto.randomBytes(32).toString("base64url");
      clientSecretHash = await PasswordService.hash(clientSecret);
    }

    // Public clients MUST use PKCE
    const requirePkce =
      data.clientType === "public" ? true : (data.requirePkce ?? false);

    // Third-party clients MUST show consent
    const requireConsent = data.isFirstParty
      ? false
      : (data.requireConsent ?? true);

    // Create client
    const client = await this.clientRepository.save({
      tenantId: data.tenantId,
      clientId,
      clientSecretHash,
      clientType: data.clientType,
      name: data.name,
      description: data.description,
      logoUrl: data.logoUrl,
      websiteUrl: data.websiteUrl,
      privacyPolicyUrl: data.privacyPolicyUrl,
      termsOfServiceUrl: data.termsOfServiceUrl,
      grantTypes: data.grantTypes,
      redirectUris: data.redirectUris,
      postLogoutRedirectUris: data.postLogoutRedirectUris,
      allowedOrigins: data.allowedOrigins,
      allowedScopes: data.allowedScopes,
      defaultScopes: data.defaultScopes,
      requirePkce,
      requireConsent,
      isFirstParty: data.isFirstParty ?? false,
      accessTokenTtl: data.accessTokenTtl ?? 900, // 15 min
      refreshTokenTtl: data.refreshTokenTtl ?? 604800, // 7 days
      idTokenTtl: data.idTokenTtl ?? 3600, // 1 hour
      authorizationCodeTtl: 600, // 10 minutes
      metadata: data.metadata,
      createdBy: data.createdBy,
    });

    logger.info({ clientId: client.clientId, name: client.name }, "Created OAuth client");

    return {
      client,
      clientSecret, // Return plaintext secret only on creation
    };
  }

  /**
   * Get client by client_id
   */
  async getClient(clientId: string): Promise<OAuthClient> {
    const client = await this.clientRepository.findOne({
      where: { clientId, isActive: true },
    });

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    return client;
  }

  /**
   * Get client with secret hash (for validation)
   */
  async getClientWithSecret(clientId: string): Promise<OAuthClient> {
    const client = await this.clientRepository
      .createQueryBuilder("client")
      .where("client.clientId = :clientId", { clientId })
      .andWhere("client.isActive = :isActive", { isActive: true })
      .addSelect("client.clientSecretHash")
      .getOne();

    if (!client) {
      throw new NotFoundException("Client not found");
    }

    return client;
  }

  /**
   * Validate client credentials
   */
  async validateClient(
    clientId: string,
    clientSecret?: string,
  ): Promise<OAuthClient> {
    const client = await this.getClientWithSecret(clientId);

    // Public clients don't have secrets
    if (client.clientType === "public") {
      if (clientSecret) {
        throw new BadRequestException(
          "Public clients should not send client_secret",
        );
      }
      return client;
    }

    // Confidential clients must provide secret
    if (client.clientType === "confidential") {
      if (!clientSecret) {
        throw new BadRequestException(
          "client_secret required for confidential clients",
        );
      }

      if (!client.clientSecretHash) {
        throw new Error("Client secret hash missing");
      }

      const isValid = await PasswordService.verify(
        client.clientSecretHash,
        clientSecret,
      );

      if (!isValid) {
        throw new BadRequestException("Invalid client credentials");
      }

      return client;
    }

    throw new Error("Invalid client type");
  }

  /**
   * Validate redirect URI
   */
  async validateRedirectUri(
    client: OAuthClient,
    redirectUri: string,
  ): Promise<boolean> {
    if (!client.redirectUris.includes(redirectUri)) {
      throw new BadRequestException("Invalid redirect_uri");
    }

    return true;
  }

  /**
   * Validate grant type
   */
  async validateGrantType(
    client: OAuthClient,
    grantType: string,
  ): Promise<boolean> {
    if (!client.grantTypes.includes(grantType)) {
      throw new BadRequestException(`Grant type not allowed: ${grantType}`);
    }

    return true;
  }

  /**
   * Validate scopes
   */
  async validateScopes(
    client: OAuthClient,
    requestedScopes: string[],
  ): Promise<string[]> {
    // If no scopes allowed, use defaults or return empty
    if (!client.allowedScopes || client.allowedScopes.length === 0) {
      return client.defaultScopes || [];
    }

    // Filter requested scopes to only allowed ones
    const allowedScopes = requestedScopes.filter((scope) =>
      client.allowedScopes!.includes(scope),
    );

    // If no valid scopes, use defaults
    if (allowedScopes.length === 0 && client.defaultScopes) {
      return client.defaultScopes;
    }

    return allowedScopes;
  }

  /**
   * Update client
   */
  async updateClient(
    clientId: string,
    data: UpdateClientDto,
  ): Promise<OAuthClient> {
    const client = await this.getClient(clientId);

    // Validate redirect URIs if updated
    if (data.redirectUris) {
      for (const uri of data.redirectUris) {
        try {
          const url = new URL(uri);
          const isLocalhost =
            url.hostname === "localhost" || url.hostname === "127.0.0.1";
          const isHttps = url.protocol === "https:";

          if (!isHttps && !isLocalhost) {
            throw new BadRequestException(
              `Redirect URI must use HTTPS: ${uri}`,
            );
          }
        } catch (error) {
          throw new BadRequestException(`Invalid redirect URI: ${uri}`);
        }
      }
    }

    // Update fields
    Object.assign(client, data);

    await this.clientRepository.save(client);

    logger.info({ clientId: client.clientId }, "Updated OAuth client");

    return client;
  }

  /**
   * Rotate client secret
   */
  async rotateClientSecret(clientId: string): Promise<{
    client: OAuthClient;
    clientSecret: string;
  }> {
    const client = await this.getClient(clientId);

    if (client.clientType !== "confidential") {
      throw new BadRequestException("Only confidential clients have secrets");
    }

    // Generate new secret
    const clientSecret = crypto.randomBytes(32).toString("base64url");
    const clientSecretHash = await PasswordService.hash(clientSecret);

    // Update client
    client.clientSecretHash = clientSecretHash;
    await this.clientRepository.save(client);

    logger.info({ clientId: client.clientId }, "Rotated client secret");

    return {
      client,
      clientSecret, // Return plaintext secret only once
    };
  }

  /**
   * Delete client
   */
  async deleteClient(clientId: string): Promise<void> {
    const client = await this.getClient(clientId);

    // Soft delete by marking inactive
    client.isActive = false;
    await this.clientRepository.save(client);

    logger.info({ clientId: client.clientId }, "Deleted OAuth client");
  }

  /**
   * List clients for tenant
   */
  async listClients(
    tenantId: string,
    options?: {
      isActive?: boolean;
      isFirstParty?: boolean;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ clients: OAuthClient[]; total: number }> {
    const query = this.clientRepository
      .createQueryBuilder("client")
      .where("client.tenantId = :tenantId", { tenantId });

    if (options?.isActive !== undefined) {
      query.andWhere("client.isActive = :isActive", {
        isActive: options.isActive,
      });
    }

    if (options?.isFirstParty !== undefined) {
      query.andWhere("client.isFirstParty = :isFirstParty", {
        isFirstParty: options.isFirstParty,
      });
    }

    query.orderBy("client.createdAt", "DESC");

    if (options?.limit) {
      query.take(options.limit);
    }

    if (options?.offset) {
      query.skip(options.offset);
    }

    const [clients, total] = await query.getManyAndCount();

    return { clients, total };
  }
}
