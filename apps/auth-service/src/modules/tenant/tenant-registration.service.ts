import {
  Injectable,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
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
import { PasswordService } from "@repo/security";
import { TenantService } from "./tenant.service";
import { SessionService } from "@/common/service/session.service";
import { JwksService } from "@/modules/oauth/services/jwks.service";
import { OAuthRefreshTokenService } from "@/modules/oauth/services/oauth-refresh-token.service";
import { RedisService } from "@/common/service/redis.service";
import { logger } from "@/common/logger";
import { SystemRoles } from "@/modules/rbac/constants/system-roles";
import { TenantSchemaService } from "@/core/tenant/tenant-schema.service";
import { TenantContextService } from "@/core/database/tenant-context.service";

export class RegisterTenantDto {
  workspaceName!: string;
  slug!: string;
  adminName!: string;
  adminEmail!: string;
  adminPassword!: string;
  idempotencyKey!: string;
}

export interface TenantRegistrationResult {
  accessToken: string;
  refreshToken: string;
  tenantSlug: string;
  user: { id: string; email: string; name: string };
}

const RESERVED_SLUGS = new Set([
  "admin", "api", "auth", "www", "mail", "smtp", "sentry",
  "support", "help", "status", "billing", "dashboard",
  "login", "logout", "signup", "register", "setup", "onboarding",
  "app", "console", "manage", "portal",
]);

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
  ): Promise<{ available: boolean; reason?: string }> {
    if (slug.length < 4)
      return { available: false, reason: "Slug must be at least 4 characters" };
    if (slug.length > 63)
      return { available: false, reason: "Slug must be 63 characters or less" };
    if (!/^[a-z0-9-]+$/.test(slug))
      return { available: false, reason: "Only lowercase letters, numbers, and hyphens allowed" };
    if (slug.startsWith("-") || slug.endsWith("-"))
      return { available: false, reason: "Slug cannot start or end with a hyphen" };
    if (RESERVED_SLUGS.has(slug))
      return { available: false, reason: "This slug is reserved" };

    const reservationKey = `common:slug:reservation:${slug}`;
    const reserved = await this.redisService
      .get("", "", reservationKey)
      .catch(() => null);
    if (reserved)
      return { available: false, reason: "This slug is being claimed by another user" };

    const existing = await this.tenantRepository.findOne({ where: { slug } });
    if (existing)
      return { available: false, reason: "This slug is already taken" };

    await this.redisService
      .set("", "", reservationKey, "pending", 300)
      .catch(() => {});

    return { available: true };
  }

  async registerTenant(
    dto: RegisterTenantDto,
    ipAddress: string,
    userAgent: string,
  ): Promise<TenantRegistrationResult> {
    // Validate slug
    const slugCheck = await this.checkSlugAvailability(dto.slug);
    if (!slugCheck.available) {
      throw new ConflictException(slugCheck.reason ?? "Slug is not available");
    }

    // Validate password
    const strength = PasswordService.validateStrength(dto.adminPassword);
    if (!strength.isValid) {
      throw new BadRequestException({
        message: "Password does not meet security requirements",
        errors: strength.errors,
      });
    }

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
        throw new ConflictException("This slug is already taken");
      }

      // Create the tenant record + tenant schema (auto-committed, inside the lock).
      tenant = await this.tenantService.create({
        slug: dto.slug,
        name: dto.workspaceName,
        environment: "production",
      });

      // Begin an explicit transaction for all tenant data so that a mid-flight
      // failure leaves no partial users / roles / policies committed.
      await qr.startTransaction();
      transactionStarted = true;
      await qr.query(`SET search_path TO "${schemaName}", public, extensions`);

      const result = await this.tenantContext.run(
        { queryRunner: qr, schemaName },
        async () => {
          const passwordHash = await PasswordService.hash(dto.adminPassword);
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

          const session = await this.sessionService.createSession({
            userId: user.id,
            tenantId: tenant!.id,
            email: user.email,
            ipAddress,
            userAgent,
          });

          const { token: refreshToken } =
            await this.oauthRefreshTokenService.createRefreshToken({
              tenantId: tenant!.id,
              userId: user.id,
              sessionId: session.id,
              clientId: undefined,
              ipAddress,
              userAgent,
              expiresInDays: 30,
            });

          const { kid, privateKey } = await this.jwksService.getCurrentSigningKey(
            tenant!.id,
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
              tenantId: tenant!.id,
              tenantSlug: tenant!.slug,
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

          return {
            accessToken,
            refreshToken,
            tenantSlug: tenant!.slug,
            user: { id: user.id, email: user.email, name: dto.adminName },
          };
        },
      );

      await qr.commitTransaction();
      transactionStarted = false;

      // Insert cross-tenant membership record in public schema (best-effort — do not roll back tenant on failure)
      try {
        await qr.query(`SET search_path TO public, extensions`);
        await qr.query(
          `INSERT INTO public.user_tenant_memberships (user_id, user_email, tenant_id, tenant_slug, role_slug)
           VALUES ($1, $2, $3, $4, 'owner')
           ON CONFLICT (user_id, tenant_id) DO NOTHING`,
          [result.user.id, result.user.email, tenant.id, tenant.slug],
        );
      } catch (membershipErr) {
        logger.warn({ err: membershipErr, tenantId: tenant.id }, "Failed to insert user_tenant_memberships — non-fatal");
      }

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
      await this.tenantRepository.delete({ id: tenantId });
    } catch (err) {
      logger.error({ err, tenantId }, "Failed to delete tenant during registration rollback");
    }
    logger.warn({ tenantId, schemaName }, "Tenant registration rolled back after data failure");
  }
}
