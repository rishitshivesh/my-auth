import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";

/**
 * TokenEncryptionService
 *
 * Encrypts/decrypts OAuth tokens before storing in database
 *
 * Uses AES-256-GCM for authenticated encryption
 *
 * Why encrypt tokens?
 * - Security: If DB is compromised, tokens can't be used
 * - Compliance: GDPR, SOC2, ISO 27001 require encryption at rest
 * - Best practice: Never store sensitive tokens in plaintext
 */
@Injectable()
export class TokenEncryptionService {
  private readonly logger = new Logger(TokenEncryptionService.name);
  private readonly algorithm = "aes-256-gcm";
  private readonly key: Buffer;

  constructor(private configService: ConfigService) {
    // Get encryption key from environment
    const keyHex = this.configService.get<string>("TOKEN_ENCRYPTION_KEY");

    if (!keyHex) {
      throw new Error("TOKEN_ENCRYPTION_KEY not configured");
    }

    // Convert hex string to buffer (must be 32 bytes for AES-256)
    this.key = Buffer.from(keyHex, "hex");

    if (this.key.length !== 32) {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY must be 32 bytes (64 hex characters)",
      );
    }

    this.logger.log("TokenEncryptionService initialized");
  }

  /**
   * Encrypt a token
   *
   * Format: iv:authTag:encryptedData
   * All parts are hex-encoded
   *
   * @param plaintext Token to encrypt
   * @returns Encrypted token string
   */
  encrypt(plaintext: string): string {
    if (!plaintext) {
      throw new Error("Cannot encrypt empty token");
    }

    try {
      // Generate random IV (initialization vector)
      const iv = crypto.randomBytes(16);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, this.key, iv);

      // Encrypt
      let encrypted = cipher.update(plaintext, "utf8", "hex");
      encrypted += cipher.final("hex");

      // Get authentication tag (GCM mode)
      const authTag = cipher.getAuthTag();

      // Combine: iv:authTag:encrypted
      const result = `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;

      this.logger.debug("Token encrypted successfully");

      return result;
    } catch (error: unknown) {
      this.logger.error("Failed to encrypt token", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new Error("Token encryption failed");
    }
  }

  /**
   * Decrypt a token
   *
   * @param encryptedData Encrypted token string (iv:authTag:encrypted)
   * @returns Decrypted token
   */
  decrypt(encryptedData: string): string {
    if (!encryptedData) {
      throw new Error("Cannot decrypt empty data");
    }

    try {
      // Split into parts
      const parts = encryptedData.split(":");

      if (parts.length !== 3) {
        throw new Error("Invalid encrypted data format");
      }

      const [ivHex, authTagHex, encrypted] = parts;

      // Convert from hex
      const iv = Buffer.from(ivHex!, "hex");
      const authTag = Buffer.from(authTagHex!, "hex");

      // Create decipher
      const decipher = crypto.createDecipheriv(this.algorithm, this.key, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      let decrypted = decipher.update(encrypted!, "hex", "utf8");
      decrypted += decipher.final("utf8");

      this.logger.debug("Token decrypted successfully");

      return decrypted;
    } catch (error: unknown) {
      this.logger.error("Failed to decrypt token", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error("Token decryption failed");
    }
  }

  /**
   * Encrypt multiple tokens at once
   */
  encryptTokens(tokens: {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
  }): {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
  } {
    return {
      accessToken: tokens.accessToken
        ? this.encrypt(tokens.accessToken)
        : undefined,
      refreshToken: tokens.refreshToken
        ? this.encrypt(tokens.refreshToken)
        : undefined,
      idToken: tokens.idToken ? this.encrypt(tokens.idToken) : undefined,
    };
  }

  /**
   * Decrypt multiple tokens at once
   */
  decryptTokens(tokens: {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
  }): {
    accessToken?: string;
    refreshToken?: string;
    idToken?: string;
  } {
    return {
      accessToken: tokens.accessToken
        ? this.decrypt(tokens.accessToken)
        : undefined,
      refreshToken: tokens.refreshToken
        ? this.decrypt(tokens.refreshToken)
        : undefined,
      idToken: tokens.idToken ? this.decrypt(tokens.idToken) : undefined,
    };
  }

  /**
   * Generate a secure encryption key
   *
   * Run this once to generate key, then store in env
   *
   * Usage:
   * node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }
}
