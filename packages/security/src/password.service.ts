import * as argon2 from "argon2";
import { randomInt } from "crypto";

/**
 * Password hashing service using Argon2id (OWASP recommended)
 *
 * Argon2id is the winner of the Password Hashing Competition and provides
 * better security than bcrypt against GPU attacks and side-channel attacks.
 */

export interface PasswordHashOptions {
  memoryCost?: number; // Memory cost in KiB (default: 65536 = 64 MB)
  timeCost?: number; // Time cost (iterations, default: 3)
  parallelism?: number; // Parallelism factor (default: 4)
}

export class PasswordService {
  private static readonly DEFAULT_OPTIONS: PasswordHashOptions = {
    memoryCost: 65536, // 64 MB
    timeCost: 3, // 3 iterations
    parallelism: 4, // 4 threads
  };

  /**
   * Hash a password using Argon2id
   * @param password - Plain text password
   * @param options - Hashing options (optional)
   * @returns Hashed password string
   */
  static async hash(
    password: string,
    options: PasswordHashOptions = {},
  ): Promise<string> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    return argon2.hash(password, {
      type: argon2.argon2id, // Use Argon2id variant
      memoryCost: opts.memoryCost,
      timeCost: opts.timeCost,
      parallelism: opts.parallelism,
    });
  }

  /**
   * Verify a password against a hash
   * @param hash - Stored password hash
   * @param password - Plain text password to verify
   * @returns True if password matches, false otherwise
   */
  static async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      // Invalid hash format
      return false;
    }
  }

  /**
   * Check if a hash needs rehashing (parameters changed)
   * @param hash - Stored password hash
   * @param options - Current hashing options
   * @returns True if hash needs to be updated
   */
  static async needsRehash(
    hash: string,
    options: PasswordHashOptions = {},
  ): Promise<boolean> {
    const opts = { ...this.DEFAULT_OPTIONS, ...options };

    return argon2.needsRehash(hash, {
      // type: argon2.argon2id,
      memoryCost: opts.memoryCost,
      timeCost: opts.timeCost,
      parallelism: opts.parallelism,
    });
  }

  /**
   * Validate password strength
   * @param password - Password to validate
   * @returns Object with validation results
   */
  static validateStrength(password: string): {
    isValid: boolean;
    score: number;
    errors: string[];
  } {
    const errors: string[] = [];
    let score = 0;

    // Minimum length check
    if (password.length < 8) {
      errors.push("Password must be at least 8 characters long");
    } else if (password.length >= 8 && password.length < 12) {
      score += 1;
    } else if (password.length >= 12) {
      score += 2;
    }

    // Uppercase check
    if (!/[A-Z]/.test(password)) {
      errors.push("Password must contain at least one uppercase letter");
    } else {
      score += 1;
    }

    // Lowercase check
    if (!/[a-z]/.test(password)) {
      errors.push("Password must contain at least one lowercase letter");
    } else {
      score += 1;
    }

    // Number check
    if (!/\d/.test(password)) {
      errors.push("Password must contain at least one number");
    } else {
      score += 1;
    }

    // Special character check
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push("Password must contain at least one special character");
    } else {
      score += 1;
    }

    // Common patterns check
    const commonPatterns = [
      "password",
      "12345",
      "qwerty",
      "admin",
      "letmein",
      "welcome",
    ];
    if (
      commonPatterns.some((pattern) => password.toLowerCase().includes(pattern))
    ) {
      errors.push("Password contains common patterns");
      score -= 2;
    }

    // Sequential characters check
    if (/(.)\1{2,}/.test(password)) {
      errors.push("Password contains repeated characters");
      score -= 1;
    }

    score = Math.max(0, score); // Ensure score doesn't go below 0

    return {
      isValid: errors.length === 0 && score >= 4,
      score: Math.min(5, score), // Cap at 5
      errors,
    };
  }

  /**
   * Generate a random password
   * @param length - Password length (default: 16)
   * @returns Random secure password
   */
  static generate(length: number = 16): string {
    const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const lowercase = "abcdefghijklmnopqrstuvwxyz";
    const numbers = "0123456789";
    const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";
    const all = uppercase + lowercase + numbers + special;

    let password = "";

    // Ensure at least one of each character type
    password += uppercase[randomInt(uppercase.length)];
    password += lowercase[randomInt(lowercase.length)];
    password += numbers[randomInt(numbers.length)];
    password += special[randomInt(special.length)];

    // Fill the rest randomly
    for (let i = password.length; i < length; i++) {
      password += all[randomInt(all.length)];
    }

    // Shuffle the password
    const chars = password.split("");
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [chars[i], chars[j]] = [chars[j]!, chars[i]!];
    }
    return chars.join("");
  }
}
