import { createCipheriv, createDecipheriv, randomBytes, scrypt } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

/**
 * AES-256-GCM Encryption Service
 *
 * Provides field-level encryption for sensitive data.
 * Uses AES-256-GCM which provides both confidentiality and authenticity.
 */

export interface EncryptionResult {
  encrypted: string; // Base64 encoded
  iv: string; // Base64 encoded initialization vector
  authTag: string; // Base64 encoded authentication tag
}

export class EncryptionService {
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly IV_LENGTH = 16; // 128 bits
  private static readonly SALT_LENGTH = 32; // 256 bits
  private static readonly KEY_LENGTH = 32; // 256 bits
  private static readonly AUTH_TAG_LENGTH = 16; // 128 bits

  /**
   * Derive encryption key from master key
   * @param masterKey - Master encryption key
   * @param salt - Salt for key derivation
   * @returns Derived key
   */
  private static async deriveKey(
    masterKey: string,
    salt: Buffer,
  ): Promise<Buffer> {
    return (await scryptAsync(masterKey, salt, this.KEY_LENGTH)) as Buffer;
  }

  /**
   * Encrypt data using AES-256-GCM
   * @param plaintext - Data to encrypt
   * @param masterKey - Master encryption key
   * @param additionalData - Optional authenticated additional data (AAD)
   * @returns Encryption result with IV and auth tag
   */
  static async encrypt(
    plaintext: string,
    masterKey: string,
    additionalData?: string,
  ): Promise<EncryptionResult> {
    // Generate random IV and salt
    const iv = randomBytes(this.IV_LENGTH);
    const salt = randomBytes(this.SALT_LENGTH);

    // Derive encryption key
    const key = await this.deriveKey(masterKey, salt);

    // Create cipher
    const cipher = createCipheriv(this.ALGORITHM, key, iv);

    // Add authenticated additional data if provided
    if (additionalData) {
      cipher.setAAD(Buffer.from(additionalData, "utf8"));
    }

    // Encrypt
    let encrypted = cipher.update(plaintext, "utf8", "base64");
    encrypted += cipher.final("base64");

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine salt + iv + encrypted data for storage
    const combined = Buffer.concat([
      salt,
      iv,
      Buffer.from(encrypted, "base64"),
    ]);

    return {
      encrypted: combined.toString("base64"),
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  /**
   * Decrypt data using AES-256-GCM
   * @param encryptedData - Encrypted data object
   * @param masterKey - Master encryption key
   * @param additionalData - Optional authenticated additional data (AAD)
   * @returns Decrypted plaintext
   */
  static async decrypt(
    encryptedData: EncryptionResult | string,
    masterKey: string,
    additionalData?: string,
  ): Promise<string> {
    let encrypted: string;
    let authTag: Buffer;
    let combined: Buffer;

    if (typeof encryptedData === "string") {
      // Legacy format: just the encrypted string
      combined = Buffer.from(encryptedData, "base64");
    } else {
      // New format: object with encrypted, iv, authTag
      combined = Buffer.from(encryptedData.encrypted, "base64");
      authTag = Buffer.from(encryptedData.authTag, "base64");
    }

    // Extract salt, iv, and encrypted data
    const salt = combined.subarray(0, this.SALT_LENGTH);
    const iv = combined.subarray(
      this.SALT_LENGTH,
      this.SALT_LENGTH + this.IV_LENGTH,
    );
    const encryptedBuffer = combined.subarray(
      this.SALT_LENGTH + this.IV_LENGTH,
    );

    // Derive decryption key
    const key = await this.deriveKey(masterKey, salt);

    // Create decipher
    const decipher = createDecipheriv(this.ALGORITHM, key, iv);

    // Set authentication tag
    if (typeof encryptedData !== "string" && authTag!) {
      decipher.setAuthTag(authTag);
    }

    // Add authenticated additional data if provided
    if (additionalData) {
      decipher.setAAD(Buffer.from(additionalData, "utf8"));
    }

    // Decrypt
    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString("utf8");
  }

  /**
   * Encrypt a JSON object
   * @param obj - Object to encrypt
   * @param masterKey - Master encryption key
   * @returns Encrypted result
   */
  static async encryptObject<T>(
    obj: T,
    masterKey: string,
  ): Promise<EncryptionResult> {
    const plaintext = JSON.stringify(obj);
    return this.encrypt(plaintext, masterKey);
  }

  /**
   * Decrypt to JSON object
   * @param encryptedData - Encrypted data
   * @param masterKey - Master encryption key
   * @returns Decrypted object
   */
  static async decryptObject<T>(
    encryptedData: EncryptionResult | string,
    masterKey: string,
  ): Promise<T> {
    const plaintext = await this.decrypt(encryptedData, masterKey);
    return JSON.parse(plaintext);
  }

  /**
   * Generate a secure random key
   * @param length - Key length in bytes (default: 32 for AES-256)
   * @returns Base64 encoded random key
   */
  static generateKey(length: number = this.KEY_LENGTH): string {
    return randomBytes(length).toString("base64");
  }

  /**
   * Hash data using SHA-256
   * @param data - Data to hash
   * @returns Hex encoded hash
   */
  static hash(data: string): string {
    const crypto = require("crypto");
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  /**
   * Generate HMAC signature
   * @param data - Data to sign
   * @param secret - Secret key
   * @returns Hex encoded HMAC
   */
  static hmac(data: string, secret: string): string {
    const crypto = require("crypto");
    return crypto.createHmac("sha256", secret).update(data).digest("hex");
  }

  /**
   * Verify HMAC signature
   * @param data - Original data
   * @param signature - HMAC signature to verify
   * @param secret - Secret key
   * @returns True if signature is valid
   */
  static verifyHmac(data: string, signature: string, secret: string): boolean {
    const expected = this.hmac(data, secret);

    // Use timing-safe comparison to prevent timing attacks
    if (expected.length !== signature.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < expected.length; i++) {
      result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    }

    return result === 0;
  }
}
