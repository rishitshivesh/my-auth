import { Injectable } from "@nestjs/common";
import { IsEmail, IsString, MaxLength, MinLength } from "class-validator";
import { ApiException } from "../../common/http";
import { AMR_PASSWORD } from "@/modules/auth/auth-methods";
import { assertPasswordPolicy } from "../auth/password-policy";
import { hashPassword } from "../auth/password-hashing";
import { InjectRepository, InjectDataSource } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import {
  User,
  Tenant,
  Role,
  UserRole,
  OAuthRefreshToken,
  KeyPair,
  Policy,
  RolePolicy,
} from "@repo/database";
import { TenantService } from "./tenant.service";
import { SessionService } from "@/common/service/session.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { RedisService } from "@/common/service/redis.service";
import { logger } from "@/common/logger";
import { SystemRoles } from "@/modules/rbac/constants/system-roles";
import { TenantSchemaService } from "@/core/tenant/tenant-schema.service";
import { TenantContextService } from "@/core/database/tenant-context.service";
import { isReservedSlug } from "./reserved-slugs";

export class RegisterTenantDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  workspaceName!: string;

  @IsString()
  @MaxLength(63)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  adminName!: string;

  @IsEmail()
  @MaxLength(320)
  adminEmail!: string;

  @IsString()
  @MaxLength(128)
  adminPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  idempotencyKey!: string;
}

export interface TenantRegistrationResult {
  accessToken: string;
  refreshToken: string;
  tenantSlug: string;
  user: { id: string; email: string; name: string };
}

@Injectable()
export class TenantRegistrationService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Tenant)
    private readonly tenantRepository: Repository<Tenant>,
    @InjectRepository(Role)
    private readonly roleRepository: Repository<Role>,
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
    @InjectRepository(Policy)
    private readonly policyRepository: Repository<Policy>,
    @InjectRepository(RolePolicy)
    private readonly rolePolicyRepository: Repository<RolePolicy>,
    private readonly tenantService: TenantService,
    private readonly sessionService: SessionService,
    private readonly jwksService: JwksService,
    private readonly oauthRefreshTokenService: OAuthRefreshTokenService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly tenantSchemaService: TenantSchemaService,
    private readonly tenantContext: TenantContextService,
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async checkSlugAvailability(
    slug: string,
    options: { reserve?: boolean } = {},
  ): Promise<{ available: boolean; reason?: string }> {
    const { reserve = true } = options;
    if (slug.length < 4)
      return { available: false, reason: "Slug must be at least 4 characters" };
    if (slug.length > 63)
      return { available: false, reason: "Slug must be 63 characters or less" };
    if (!/^[a-z0-9-]+$/.test(slug))
      return { available: false, reason: "Only lowercase letters, numbers, and hyphens allowed" };
    if (slug.startsWith("-") || slug.endsWith("-"))
      return { available: false, reason: "Slug cannot start or end with a hyphen" };
    if (isReservedSlug(slug))
      return { available: false, reason: "This slug is reserved" };

    const reservationKey = `common:slug:reservation:${slug}`;
    // Registration itself must not trip over the reservation made by the
    // wizard's own slug-check; the DB unique check + advisory lock in
    // registerTenant() are the authoritative guards.
    if (reserve) {
      const reserved = await this.redisService
        .get("", "", reservationKey)
        .catch(() => null);
      if (reserved)
        return { available: false, reason: "This slug is being claimed by another user" };
    }

    const existing = await this.tenantRepository.findOne({ where: { slug } });
    if (existing)
      return { available: false, reason: "This slug is already taken" };

    if (reserve) {
      await this.redisService
        .set("", "", reservationKey, "pending", 300)
        .catch(() => {});
    }

    return { available: true };
  }

  async registerTenant(
    dto: RegisterTenantDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<TenantRegistrationResult> {
    // Validate slug
    const slugCheck = await this.checkSlugAvailability(dto.slug, {
      reserve: false,
    });
    if (!slugCheck.available) {
      throw new ApiException("RESOURCE_CONFLICT", {
        detail: slugCheck.reason ?? "Slug is not available",
      });
    }

    // Validate password
    assertPasswordPolicy(dto.adminPassword, { email: dto.adminEmail });

    const schemaName = this.tenantSchemaService.getSchemaName(dto.slug);
    const qr = this.dataSource.createQueryRunner();
    await qr.connect();

    // Advisory lock on the slug prevents two concurrent requests from racing
    // through the TOCTOU window between checkSlugAvailability and tenant creation.
    await qr.query(`SELECT pg_advisory_lock(hashtext($1)::bigint)`, [
      `tenant_reg:${dto.slug}`,
    ]);

    let tenant: Tenant | null = null;
    let transactionStarted = false;

    try {
      // Re-check slug inside the lock (eliminates the TOCTOU race).
      await qr.query(`SET search_path TO public, extensions`);
      const existing = await qr.manager
        .getRepository(Tenant)
        .findOne({ where: { slug: dto.slug } });
      if (existing) {
        throw new ApiException("RESOURCE_CONFLICT", { detail: "This slug is already taken" });
      }

      // Create the tenant record + tenant schema (auto-committed, inside the lock).
      tenant = await this.tenantService.create({
        slug: dto.slug,
        name: dto.workspaceName,
        environment: "production",
      });
      await this.jwksService.ensureTenantKeyExists(tenant.id);

      // Begin an explicit transaction for all tenant data so that a mid-flight
      // failure leaves no partial users / roles / policies committed.
      await qr.startTransaction();
      transactionStarted = true;
      await qr.query(`SET search_path TO "${schemaName}", public, extensions`);

      const created = await this.tenantContext.run(
        { queryRunner: qr, schemaName },
        async () => {
          const passwordHash = await hashPassword(dto.adminPassword);
          const nameParts = dto.adminName.trim().split(/\s+/);
          const firstName = nameParts[0] ?? dto.adminName;
          const lastName = nameParts.slice(1).join(" ") || undefined;

          const user = await this.userRepository.save(
            this.userRepository.create({
              tenantId: tenant!.id,
              email: dto.adminEmail,
              emailVerified: true,
              firstName,
              lastName,
              displayName: dto.adminName,
              primaryAuthMethod: "password",
              passwordHash,
              isActive: true,
              mfaEnabled: false,
              failedLoginAttempts: 0,
              forcePasswordChange: false,
              passwordHistory: [],
              metadata: { source: "tenant-self-service" },
            }),
          );

          const systemRoleDefinitions = Object.values(SystemRoles);
          const createdRoles: Role[] = [];

          for (const def of systemRoleDefinitions) {
            const role = await this.roleRepository.save(
              this.roleRepository.create({
                tenantId: tenant!.id,
                name: def.slug,
                displayName: def.name,
                description: def.description,
                isSystem: def.isSystem,
                priority: def.priority,
                scope: "tenant",
              } as Partial<Role>),
            );
            createdRoles.push(role);

            const policy = await this.policyRepository.save(
              this.policyRepository.create({
                tenantId: tenant!.id,
                name: `${def.name} Policy`,
                description: `System policy for ${def.name} role`,
                document: def.policy,
                isSystem: true,
                type: "managed",
              } as Partial<Policy>),
            );

            await this.rolePolicyRepository.save(
              this.rolePolicyRepository.create({
                tenantId: tenant!.id,
                roleId: role.id,
                policyId: policy.id,
              } as Partial<RolePolicy>),
            );
          }

          const ownerRole = createdRoles.find((r) => r.name === "owner");
          if (ownerRole) {
            await this.userRoleRepository.save(
              this.userRoleRepository.create({
                tenantId: tenant!.id,
                userId: user.id,
                roleId: ownerRole.id,
                reason: "Tenant self-service registration",
                metadata: { source: "onboarding" },
              }),
            );
          }

          return { user, ownerRole };
        },
      );

      await qr.commitTransaction();
      transactionStarted = false;

      // Sessions and tokens use their own connections, so they must run after
      // the tenant data above is committed (sessions reference users by FK).
      const { user, ownerRole } = created;
      const session = await this.sessionService.createSession({
        userId: user.id,
        tenantId: tenant.id,
        email: user.email,
        ipAddress,
        userAgent,
        amr: AMR_PASSWORD,
      });

      const { token: refreshToken } =
        await this.oauthRefreshTokenService.createRefreshToken({
          tenantId: tenant.id,
          userId: user.id,
          sessionId: session.id,
          clientId: undefined,
          ipAddress,
          userAgent,
          expiresInDays: 30,
        });

      const { kid, privateKey } = await this.jwksService.getCurrentSigningKey(
        tenant.id,
      );
      const privateKeyPem = privateKey.export({
        type: "pkcs8",
        format: "pem",
      }) as string;

      const groups = ownerRole ? [ownerRole.name] : [];

      const accessToken = this.jwtService.sign(
        {
          sub: user.id,
          email: user.email,
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          groups,
          sessionId: session.id,
        },
        {
          privateKey: privateKeyPem,
          algorithm: "RS256",
          header: { alg: "RS256", kid },
          expiresIn: "15m",
        },
      );

      const result: TenantRegistrationResult = {
        accessToken,
        refreshToken,
        tenantSlug: tenant.slug,
        user: { id: user.id, email: user.email, name: dto.adminName },
      };

      logger.info(
        { tenantId: tenant.id, slug: tenant.slug },
        "Tenant self-service registration completed",
      );

      return result;
    } catch (err) {
      if (transactionStarted) {
        try { await qr.rollbackTransaction(); } catch {}
      }
      // Best-effort cleanup: drop the schema and delete the tenant record so
      // the slug is freed and a retry can succeed.
      if (tenant) {
        await this.cleanupFailedRegistration(tenant.id, schemaName);
      }
      throw err;
    } finally {
      try {
        await qr.query(`SELECT pg_advisory_unlock(hashtext($1)::bigint)`, [
          `tenant_reg:${dto.slug}`,
        ]);
      } catch {}
      try { await qr.query(`SET search_path TO public`); } catch {}
      await qr.release();
    }
  }

  private async cleanupFailedRegistration(
    tenantId: string,
    schemaName: string,
  ): Promise<void> {
    try {
      await this.dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
    } catch (err) {
      logger.error({ err, schemaName }, "Failed to drop schema during registration rollback");
    }
    try {
      // ensureTenantKeyExists() may have already provisioned a signing key
      // before the failure — without this, the encrypted private key for a
      // tenant that no longer exists would persist indefinitely (key_pairs
      // has no FK/cascade to tenants).
      await this.jwksService.deleteTenantKeys(tenantId);
    } catch (err) {
      logger.error({ err, tenantId }, "Failed to delete tenant signing key during registration rollback");
    }
    try {
      await this.tenantRepository.delete({ id: tenantId });
    } catch (err) {
      logger.error({ err, tenantId }, "Failed to delete tenant during registration rollback");
    }
    logger.warn({ tenantId, schemaName }, "Tenant registration rolled back after data failure");
  }
}
