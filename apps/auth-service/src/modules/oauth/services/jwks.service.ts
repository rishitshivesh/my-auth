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

@Injectable()
export class JwksService implements OnModuleInit {
  private signingKeys = new Map<string, SigningKey>();
  private platformSigningKey!: SigningKey;

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
    this.platformSigningKey = {
      kid: keyPair.kid,
      privateKey,
      algorithm: keyPair.algorithm,
    };
    this.signingKeys.set(this.cacheKey(null), this.platformSigningKey);
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
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 90);

    const keyPair = this.keyPairRepository.create({
      kid,
      tenantId,
      algorithm: "RS256",
      use: "sig",
      publicKeyPem: publicKey as string,
      encryptedPrivateKey: encrypted.encrypted,
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
        iv: "",
        authTag: keyPair.authTag,
      },
      masterKey,
    );
    return crypto.createPrivateKey(pem);
  }

  async getCurrentSigningKey(
    tenantId?: string,
  ): Promise<SigningKey> {
    const key = tenantId ? this.cacheKey(tenantId) : this.cacheKey(null);
    const cached = this.signingKeys.get(key);
    if (cached) return cached;

    if (tenantId) {
      const keyPair = await this.keyPairRepository.findOne({
        where: { tenantId, status: "active" },
        order: { createdAt: "DESC" },
      });

      if (keyPair) {
        const privateKey = await this.decryptPrivateKey(keyPair);
        const signingKey: SigningKey = {
          kid: keyPair.kid,
          privateKey,
          algorithm: keyPair.algorithm,
        };
        this.signingKeys.set(key, signingKey);
        return signingKey;
      }
    }

    return this.platformSigningKey;
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
    this.signingKeys.set(cacheKey, signingKey);

    if (resolvedTenantId === null) {
      this.platformSigningKey = signingKey;
    }

    logger.info(
      { kid: newKeyPair.kid, tenantId: resolvedTenantId },
      "Rotated RSA signing key",
    );
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

  getJWKS() {
    return {
      keys: [this.toJWK(
        crypto.createPublicKey(this.platformSigningKey.privateKey)
          .export({ type: "spki", format: "pem" }) as string,
        this.platformSigningKey.kid,
      )],
    };
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
