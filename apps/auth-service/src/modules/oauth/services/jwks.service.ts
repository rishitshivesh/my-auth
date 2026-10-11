import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull, Not, In } from "typeorm";
import { ConfigService } from "@nestjs/config";
import { KeyPair } from "@repo/database";
import { EncryptionService } from "@repo/security";
import * as crypto from "crypto";
import { v4 as uuidv4 } from "uuid";
import { logger } from "@/common/logger";

interface SigningKey {
  kid: string;
  privateKey: crypto.KeyObject;
  algorithm: string;
}

interface CachedSigningKey {
  key: SigningKey;
  cachedAt: number;
}

/**
 * How long a cached signing key is trusted before re-checking the DB.
 *
 * Rotation only updates the cache of the replica that performed it (the one
 * holding TenantJobRunner's advisory lock for that tick) — every other
 * replica would otherwise keep signing with a key the DB, and every other
 * replica, now considers retired/revoked. This bounds that staleness window
 * instead of trusting the cache indefinitely.
 */
const CACHE_FRESHNESS_MS = 5 * 60 * 1000;

@Injectable()
export class JwksService implements OnModuleInit {
  private signingKeys = new Map<string, CachedSigningKey>();

  constructor(
    @InjectRepository(KeyPair)
    private readonly keyPairRepository: Repository<KeyPair>,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    await this.loadOrCreatePlatformKey();
  }

  private getMasterKey(): string {
    return this.configService.getOrThrow<string>("KEYRING_MASTER_KEY");
  }

  private async loadOrCreatePlatformKey(): Promise<void> {
    let keyPair = await this.keyPairRepository.findOne({
      where: { tenantId: IsNull(), status: "active" },
      order: { createdAt: "DESC" },
    });

    if (!keyPair) {
      keyPair = await this.generateAndStoreKeyPair(null);
      logger.info({ kid: keyPair.kid }, "Generated new platform RSA key pair");
    } else {
      logger.info({ kid: keyPair.kid }, "Loaded existing platform RSA key pair");
    }

    const privateKey = await this.decryptPrivateKey(keyPair);
    const signingKey: SigningKey = {
      kid: keyPair.kid,
      privateKey,
      algorithm: keyPair.algorithm,
    };
    this.signingKeys.set(this.cacheKey(null), { key: signingKey, cachedAt: Date.now() });
  }

  private cacheKey(tenantId: string | null): string {
    return tenantId ?? "__platform__";
  }

  private async generateAndStoreKeyPair(
    tenantId: string | null,
  ): Promise<KeyPair> {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });

    const masterKey = this.getMasterKey();
    const encrypted = await EncryptionService.encrypt(
      privateKey as string,
      masterKey,
    );

    const kid = uuidv4();
    const activeTtlDays = this.configService.get<number>("KEY_ACTIVE_TTL_DAYS", 90);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + activeTtlDays);

    const keyPair = this.keyPairRepository.create({
      kid,
      tenantId,
      algorithm: "RS256",
      use: "sig",
      publicKeyPem: publicKey as string,
      encryptedPrivateKey: encrypted.encrypted,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      status: "active",
      expiresAt,
    });

    return this.keyPairRepository.save(keyPair);
  }

  private async decryptPrivateKey(keyPair: KeyPair): Promise<crypto.KeyObject> {
    const masterKey = this.getMasterKey();
    const pem = await EncryptionService.decrypt(
      {
        encrypted: keyPair.encryptedPrivateKey,
        iv: keyPair.iv,
        authTag: keyPair.authTag,
      },
      masterKey,
    );
    return crypto.createPrivateKey(pem);
  }

  async getCurrentSigningKey(
    tenantId?: string,
  ): Promise<SigningKey> {
    const resolvedTenantId = tenantId ?? null;
    const cacheKey = this.cacheKey(resolvedTenantId);
    const cached = this.signingKeys.get(cacheKey);

    if (cached && Date.now() - cached.cachedAt < CACHE_FRESHNESS_MS) {
      return cached.key;
    }

    // Cache is cold or stale — confirm against the DB which key is
    // actually active, so a rotation performed by another replica is
    // picked up within CACHE_FRESHNESS_MS instead of never.
    const activeKeyPair = await this.keyPairRepository.findOne({
      where: { tenantId: resolvedTenantId === null ? IsNull() : resolvedTenantId, status: "active" },
      order: { createdAt: "DESC" },
    });

    if (!activeKeyPair) {
      // Tenant has no key of its own (not yet provisioned) — fall back to
      // the platform key rather than failing the request.
      if (resolvedTenantId !== null) {
        return this.getCurrentSigningKey();
      }
      throw new Error("No active platform signing key found");
    }

    if (cached && cached.key.kid === activeKeyPair.kid) {
      // Same key as before — just refresh the freshness timestamp, no need
      // to decrypt the private key again.
      cached.cachedAt = Date.now();
      return cached.key;
    }

    const privateKey = await this.decryptPrivateKey(activeKeyPair);
    const signingKey: SigningKey = {
      kid: activeKeyPair.kid,
      privateKey,
      algorithm: activeKeyPair.algorithm,
    };
    this.signingKeys.set(cacheKey, { key: signingKey, cachedAt: Date.now() });
    return signingKey;
  }

  async getVerificationKeys(tenantId?: string): Promise<JsonWebKeyWithKid[]> {
    const where: Record<string, unknown>[] = [
      { tenantId: IsNull(), status: In(["active", "retired"]) },
    ];

    if (tenantId) {
      where.push({ tenantId, status: In(["active", "retired"]) });
    }

    const keyPairs = await this.keyPairRepository.find({ where });

    return keyPairs.map((kp) => this.toJWK(kp.publicKeyPem, kp.kid));
  }

  async getVerificationKeyByKid(kid: string): Promise<JsonWebKeyWithKid | null> {
    const keyPair = await this.keyPairRepository.findOne({
      where: { kid, status: In(["active", "retired"]) },
    });
    if (!keyPair) return null;
    return this.toJWK(keyPair.publicKeyPem, keyPair.kid);
  }

  async rotateKey(tenantId?: string): Promise<void> {
    const resolvedTenantId = tenantId ?? null;

    const oldKey = await this.keyPairRepository.findOne({
      where: {
        tenantId: resolvedTenantId === null ? IsNull() : resolvedTenantId,
        status: "active",
      },
    });

    if (oldKey) {
      oldKey.status = "retired";
      oldKey.retiredAt = new Date();
      await this.keyPairRepository.save(oldKey);
    }

    const newKeyPair = await this.generateAndStoreKeyPair(resolvedTenantId);
    const privateKey = await this.decryptPrivateKey(newKeyPair);
    const signingKey: SigningKey = {
      kid: newKeyPair.kid,
      privateKey,
      algorithm: newKeyPair.algorithm,
    };

    const cacheKey = this.cacheKey(resolvedTenantId);
    this.signingKeys.set(cacheKey, { key: signingKey, cachedAt: Date.now() });

    logger.info(
      { kid: newKeyPair.kid, tenantId: resolvedTenantId },
      "Rotated RSA signing key",
    );
  }

  /**
   * Hard-delete every key belonging to a tenant. Only for the
   * tenant-registration rollback path — if provisioning fails after a key
   * was already created, the tenant row is about to be deleted too, so
   * there's no grace period to honour and nothing left to reference the
   * key by. Not used for normal rotation, which retires/revokes instead.
   */
  async deleteTenantKeys(tenantId: string): Promise<void> {
    await this.keyPairRepository.delete({ tenantId });
    this.signingKeys.delete(this.cacheKey(tenantId));
  }

  /**
   * Create a tenant's first signing key if it doesn't have one yet.
   * Idempotent — safe to call unconditionally from tenant provisioning.
   */
  async ensureTenantKeyExists(tenantId: string): Promise<void> {
    const existing = await this.keyPairRepository.findOne({
      where: { tenantId, status: "active" },
    });
    if (existing) return;

    const keyPair = await this.generateAndStoreKeyPair(tenantId);
    logger.info({ kid: keyPair.kid, tenantId }, "Provisioned tenant RSA key pair");
  }

  /**
   * Rotate a key (platform when `tenantId` is null) if its active key is
   * older than `activeTtlDays`, or provision one if it has none at all —
   * the latter is how tenants created before per-tenant keys existed get
   * backfilled, without a one-off data migration.
   */
  async rotateIfDue(tenantId: string | null, activeTtlDays: number): Promise<void> {
    const activeKey = await this.keyPairRepository.findOne({
      where: { tenantId: tenantId === null ? IsNull() : tenantId, status: "active" },
      order: { createdAt: "DESC" },
    });

    if (!activeKey) {
      await this.generateAndStoreKeyPair(tenantId);
      logger.info({ tenantId }, "Backfilled missing signing key");
      return;
    }

    const ageMs = Date.now() - activeKey.createdAt.getTime();
    const ttlMs = activeTtlDays * 24 * 60 * 60 * 1000;
    if (ageMs >= ttlMs) {
      await this.rotateKey(tenantId ?? undefined);
    }
  }

  /**
   * Retired keys keep verifying tokens signed before rotation for
   * `graceDays`; past that, mark them `revoked` so `getVerificationKeys()`
   * stops returning them and tokens signed with them stop verifying.
   */
  async revokeExpiredRetiredKeys(graceDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - graceDays * 24 * 60 * 60 * 1000);
    const result = await this.keyPairRepository
      .createQueryBuilder()
      .update(KeyPair)
      .set({ status: "revoked" })
      .where("status = :status", { status: "retired" })
      .andWhere("retired_at <= :cutoff", { cutoff })
      .execute();
    return result.affected ?? 0;
  }

  toJWK(publicKeyPem: string, kid: string): JsonWebKeyWithKid {
    const publicKey = crypto.createPublicKey(publicKeyPem);
    const jwk = publicKey.export({ format: "jwk" });
    return {
      kty: "RSA",
      use: "sig",
      kid,
      alg: "RS256",
      n: jwk.n as string,
      e: jwk.e as string,
    };
  }

  async getPublicKeyForToken(token: string): Promise<crypto.KeyObject> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid token format");
    }
    const header = JSON.parse(
      Buffer.from(parts[0]!, "base64url").toString(),
    );
    const kid = header?.kid as string | undefined;
    if (!kid) {
      throw new Error("Token missing kid header");
    }
    const jwk = await this.getVerificationKeyByKid(kid);
    if (!jwk) {
      throw new Error("Signing key not found for kid: " + kid);
    }
    return crypto.createPublicKey({ key: jwk as any, format: "jwk" });
  }
}

interface JsonWebKeyWithKid {
  kty: string;
  use: string;
  kid: string;
  alg: string;
  n: string;
  e: string;
}
