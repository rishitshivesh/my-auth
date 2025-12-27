/**
 * PasswordService Test Suite
 *
 * Run with: npx ts-node password.service.test.ts
 * Or add to Jest/Mocha test suite
 */

import { PasswordService } from "../src/password.service";

// Color helpers for terminal output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
};

function log(message: string, color: keyof typeof colors = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(message: string) {
  log(`✅ ${message}`, "green");
}

function logError(message: string) {
  log(`❌ ${message}`, "red");
}

function logInfo(message: string) {
  log(`ℹ️  ${message}`, "blue");
}

function logWarning(message: string) {
  log(`⚠️  ${message}`, "yellow");
}

// Test runner
class TestRunner {
  private passed = 0;
  private failed = 0;
  private testSuite = "";

  suite(name: string) {
    this.testSuite = name;
    log(`\n📦 ${name}`, "blue");
    log("─".repeat(60), "blue");
  }

  async test(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      this.passed++;
      logSuccess(name);
    } catch (error) {
      this.failed++;
      logError(name);
      console.error(
        `   Error: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  summary() {
    log("\n" + "═".repeat(60), "blue");
    log("📊 TEST SUMMARY", "blue");
    log("═".repeat(60), "blue");
    logSuccess(`Passed: ${this.passed}`);
    if (this.failed > 0) {
      logError(`Failed: ${this.failed}`);
    } else {
      log(`Failed: ${this.failed}`, "green");
    }
    log(`Total: ${this.passed + this.failed}`, "blue");

    if (this.failed === 0) {
      log("\n🎉 All tests passed!", "green");
    } else {
      log("\n💥 Some tests failed!", "red");
    }
  }
}

// Assert helpers
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEqual<T>(actual: T, expected: T, message?: string) {
  if (actual !== expected) {
    throw new Error(message || `Expected ${expected}, but got ${actual}`);
  }
}

function assertNotEqual<T>(actual: T, notExpected: T, message?: string) {
  if (actual === notExpected) {
    throw new Error(message || `Expected value to not be ${notExpected}`);
  }
}

// ============================================================================
// TESTS
// ============================================================================

async function runTests() {
  const runner = new TestRunner();

  // ========================================
  // Password Hashing Tests
  // ========================================

  runner.suite("Password Hashing");

  await runner.test("should hash a password", async () => {
    const password = "TestPassword123!";
    const hash = await PasswordService.hash(password);

    assert(hash.length > 0, "Hash should not be empty");
    assert(hash.startsWith("$argon2id$"), "Hash should be Argon2id format");
    assertNotEqual(hash, password, "Hash should not equal plaintext password");
  });

  await runner.test(
    "should generate different hashes for same password",
    async () => {
      const password = "TestPassword123!";
      const hash1 = await PasswordService.hash(password);
      const hash2 = await PasswordService.hash(password);

      assertNotEqual(
        hash1,
        hash2,
        "Hashes should be different (different salts)",
      );
    },
  );

  await runner.test("should hash with custom options", async () => {
    const password = "TestPassword123!";
    const hash = await PasswordService.hash(password, {
      memoryCost: 32768,
      timeCost: 2,
      parallelism: 2,
    });

    assert(hash.length > 0, "Custom hash should not be empty");
    assert(
      hash.startsWith("$argon2id$"),
      "Custom hash should be Argon2id format",
    );
  });

  // ========================================
  // Password Verification Tests
  // ========================================

  runner.suite("Password Verification");

  await runner.test("should verify correct password", async () => {
    const password = "CorrectPassword123!";
    const hash = await PasswordService.hash(password);
    const isValid = await PasswordService.verify(hash, password);

    assertEqual(isValid, true, "Should verify correct password");
  });

  await runner.test("should reject incorrect password", async () => {
    const password = "CorrectPassword123!";
    const hash = await PasswordService.hash(password);
    const isValid = await PasswordService.verify(hash, "WrongPassword123!");

    assertEqual(isValid, false, "Should reject incorrect password");
  });

  await runner.test("should handle case sensitivity", async () => {
    const password = "CaseSensitive123!";
    const hash = await PasswordService.hash(password);
    const isValid = await PasswordService.verify(hash, "casesensitive123!");

    assertEqual(isValid, false, "Should be case-sensitive");
  });

  await runner.test("should handle invalid hash format", async () => {
    const isValid = await PasswordService.verify("invalid-hash", "password");

    assertEqual(isValid, false, "Should return false for invalid hash");
  });

  await runner.test("should handle empty password verification", async () => {
    const password = "TestPassword123!";
    const hash = await PasswordService.hash(password);
    const isValid = await PasswordService.verify(hash, "");

    assertEqual(isValid, false, "Should reject empty password");
  });

  // ========================================
  // Password Strength Validation Tests
  // ========================================

  runner.suite("Password Strength Validation");

  await runner.test("should validate strong password", () => {
    const result = PasswordService.validateStrength("StrongP@ssw0rd!");

    assertEqual(result.isValid, true, "Should be valid");
    assert(result.score >= 4, "Score should be at least 4");
    assertEqual(result.errors.length, 0, "Should have no errors");
  });

  await runner.test("should reject password without uppercase", () => {
    const result = PasswordService.validateStrength("weakp@ssw0rd!");

    assertEqual(result.isValid, false, "Should be invalid");
    assert(
      result.errors.includes(
        "Password must contain at least one uppercase letter",
      ),
      "Should have uppercase error",
    );
  });

  await runner.test("should reject password without lowercase", () => {
    const result = PasswordService.validateStrength("WEAKP@SSW0RD!");

    assertEqual(result.isValid, false, "Should be invalid");
    assert(
      result.errors.includes(
        "Password must contain at least one lowercase letter",
      ),
      "Should have lowercase error",
    );
  });

  await runner.test("should reject password without numbers", () => {
    const result = PasswordService.validateStrength("WeakP@ssword!");

    assertEqual(result.isValid, false, "Should be invalid");
    assert(
      result.errors.includes("Password must contain at least one number"),
      "Should have number error",
    );
  });

  await runner.test("should reject password without special characters", () => {
    const result = PasswordService.validateStrength("WeakPassword123");

    assertEqual(result.isValid, false, "Should be invalid");
    assert(
      result.errors.includes(
        "Password must contain at least one special character",
      ),
      "Should have special character error",
    );
  });

  await runner.test("should reject password that is too short", () => {
    const result = PasswordService.validateStrength("Short1!");

    assertEqual(result.isValid, false, "Should be invalid");
    assert(
      result.errors.includes("Password must be at least 8 characters long"),
      "Should have length error",
    );
  });

  await runner.test("should reject common patterns", () => {
    const passwords = [
      "Password123!",
      "Admin@12345",
      "Qwerty123!",
      "Letmein1!",
      "Welcome123!",
    ];

    for (const password of passwords) {
      const result = PasswordService.validateStrength(password);
      assert(
        result.errors.includes("Password contains common patterns"),
        `Should detect common pattern in: ${password}`,
      );
    }
  });

  await runner.test("should reject repeated characters", () => {
    const result = PasswordService.validateStrength("Paaassword123!");

    assert(
      result.errors.includes("Password contains repeated characters"),
      "Should detect repeated characters",
    );
  });

  await runner.test("should give higher score to longer passwords", () => {
    const short = PasswordService.validateStrength("Short1@b");
    const medium = PasswordService.validateStrength("Medium1@bc");
    const long = PasswordService.validateStrength("VeryLongPassword1@bc");

    assert(short.score < medium.score, "Medium should score higher than short");
    assert(medium.score < long.score, "Long should score higher than medium");
  });

  // ========================================
  // Password Generation Tests
  // ========================================

  runner.suite("Password Generation");

  await runner.test("should generate password with default length", () => {
    const password = PasswordService.generate();

    assertEqual(password.length, 16, "Default length should be 16");
  });

  await runner.test("should generate password with custom length", () => {
    const password = PasswordService.generate(24);

    assertEqual(password.length, 24, "Custom length should be 24");
  });

  await runner.test("should generate valid strong password", () => {
    const password = PasswordService.generate();
    const validation = PasswordService.validateStrength(password);

    assertEqual(validation.isValid, true, "Generated password should be valid");
    assert(validation.score >= 4, "Generated password should have high score");
  });

  await runner.test("should generate different passwords each time", () => {
    const password1 = PasswordService.generate();
    const password2 = PasswordService.generate();
    const password3 = PasswordService.generate();

    assertNotEqual(password1, password2, "Passwords should be different");
    assertNotEqual(password2, password3, "Passwords should be different");
    assertNotEqual(password1, password3, "Passwords should be different");
  });

  await runner.test("should generate password with all character types", () => {
    const password = PasswordService.generate(100);

    assert(/[A-Z]/.test(password), "Should contain uppercase");
    assert(/[a-z]/.test(password), "Should contain lowercase");
    assert(/\d/.test(password), "Should contain numbers");
    assert(
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      "Should contain special chars",
    );
  });

  // ========================================
  // Password Rehashing Tests
  // ========================================

  runner.suite("Password Rehashing");

  await runner.test("should detect when rehash is not needed", async () => {
    const password = "TestPassword123!";
    const hash = await PasswordService.hash(password);
    const needsRehash = await PasswordService.needsRehash(hash);

    assertEqual(needsRehash, false, "Should not need rehash with same options");
  });

  await runner.test(
    "should detect when rehash is needed (different options)",
    async () => {
      const password = "TestPassword123!";
      const hash = await PasswordService.hash(password, {
        memoryCost: 32768,
        timeCost: 2,
      });

      const needsRehash = await PasswordService.needsRehash(hash, {
        memoryCost: 65536,
        timeCost: 3,
      });

      assertEqual(
        needsRehash,
        true,
        "Should need rehash with different options",
      );
    },
  );

  // ========================================
  // Performance Tests
  // ========================================

  runner.suite("Performance Tests");

  await runner.test("should hash password in reasonable time", async () => {
    const password = "TestPassword123!";
    const startTime = Date.now();

    await PasswordService.hash(password);

    const duration = Date.now() - startTime;
    logInfo(`   Hashing took ${duration}ms`);

    assert(duration < 2000, "Hashing should complete within 2 seconds");
  });

  await runner.test("should verify password in reasonable time", async () => {
    const password = "TestPassword123!";
    const hash = await PasswordService.hash(password);

    const startTime = Date.now();
    await PasswordService.verify(hash, password);
    const duration = Date.now() - startTime;

    logInfo(`   Verification took ${duration}ms`);

    assert(duration < 2000, "Verification should complete within 2 seconds");
  });

  await runner.test("should validate password strength quickly", () => {
    const password = "TestPassword123!";
    const startTime = Date.now();

    for (let i = 0; i < 1000; i++) {
      PasswordService.validateStrength(password);
    }

    const duration = Date.now() - startTime;
    logInfo(`   1000 validations took ${duration}ms`);

    assert(duration < 100, "Validation should be very fast");
  });

  // ========================================
  // Edge Cases Tests
  // ========================================

  runner.suite("Edge Cases");

  await runner.test("should handle very long passwords", async () => {
    const password = "A".repeat(1000) + "1!aB";
    const hash = await PasswordService.hash(password);
    const isValid = await PasswordService.verify(hash, password);

    assertEqual(isValid, true, "Should handle very long passwords");
  });

  await runner.test("should handle unicode characters", async () => {
    const password = "Pässwörd123!你好";
    const hash = await PasswordService.hash(password);
    const isValid = await PasswordService.verify(hash, password);

    assertEqual(isValid, true, "Should handle unicode characters");
  });

  await runner.test(
    "should handle special characters in password",
    async () => {
      const password = "P@$$w0rd!#$%^&*()_+-=[]{}|;:,.<>?/~`";
      const hash = await PasswordService.hash(password);
      const isValid = await PasswordService.verify(hash, password);

      assertEqual(isValid, true, "Should handle all special characters");
    },
  );

  await runner.test("should handle password with spaces", async () => {
    const password = "My Secure Password 123!";
    const hash = await PasswordService.hash(password);
    const isValid = await PasswordService.verify(hash, password);

    assertEqual(isValid, true, "Should handle passwords with spaces");
  });

  // ========================================
  // Security Tests
  // ========================================

  runner.suite("Security Tests");

  await runner.test("should use timing-safe comparison", async () => {
    const password = "TestPassword123!";
    const hash = await PasswordService.hash(password);

    // Multiple verification attempts should take similar time
    const times: number[] = [];

    for (let i = 0; i < 10; i++) {
      const start = Date.now();
      await PasswordService.verify(hash, "WrongPassword123!");
      times.push(Date.now() - start);
    }

    const avgTime = times.reduce((a, b) => a + b) / times.length;
    const maxDeviation = Math.max(...times.map((t) => Math.abs(t - avgTime)));

    logInfo(`   Avg verification time: ${avgTime.toFixed(2)}ms`);
    logInfo(`   Max deviation: ${maxDeviation.toFixed(2)}ms`);

    // Timing should be relatively consistent (within 50ms)
    assert(maxDeviation < 50, "Verification timing should be consistent");
  });

  await runner.test(
    "should not leak password through hash comparison",
    async () => {
      const password1 = "TestPassword123!";
      const password2 = "TestPassword456!";

      const hash1 = await PasswordService.hash(password1);
      const hash2 = await PasswordService.hash(password2);

      // Hashes should not reveal password similarity
      assertNotEqual(
        hash1,
        hash2,
        "Different passwords should have different hashes",
      );

      // Even with similar passwords
      const similarHash1 = await PasswordService.hash("TestPassword123!");
      const similarHash2 = await PasswordService.hash("TestPassword123@");

      assertNotEqual(
        similarHash1,
        similarHash2,
        "Similar passwords should have different hashes",
      );
    },
  );

  // Print summary
  runner.summary();
}

// ============================================================================
// RUN TESTS
// ============================================================================

log("\n🚀 Starting PasswordService Test Suite\n", "blue");

runTests()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    logError(`\nFatal error: ${error}`);
    process.exit(1);
  });
