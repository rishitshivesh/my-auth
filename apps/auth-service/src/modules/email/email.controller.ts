/**
 * Email Controller
 *
 * Test endpoint for development/testing email functionality.
 * Only works in development mode.
 */

import { Controller, Get, Query } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { ConfigService } from "@nestjs/config";
import { ApiTags, ApiOperation, ApiQuery } from "@nestjs/swagger";
import { User } from "@repo/database";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import { EmailService } from "./email.service";

@ApiTags("Email (Development)")
@Controller("email")
export class EmailController {
  constructor(
    private readonly emailService: EmailService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Test email sending (development only)
   */
  @Get("test")
  @RateLimit({ max: 5, windowMs: 60000, keyBy: "ip" })
  @ApiOperation({ summary: "Test email sending (development only)" })
  @ApiQuery({ name: "type", required: true, description: "Email type to test" })
  @ApiQuery({ name: "to", required: true, description: "Recipient email" })
  async testEmail(
    @Query("type") type: string,
    @Query("to") to: string,
  ): Promise<{ success: boolean; type: string; recipient: string; message: string }> {
    // Only allow in development
    const nodeEnv = this.configService.get<string>("NODE_ENV");
    if (nodeEnv !== "development") {
      throw new ApiException("ACCESS_FORBIDDEN", {
        detail: "Email testing is only available when NODE_ENV=development",
      });
    }

    // Mock user data for testing
    const mockUser = {
      id: "test-user-id",
      tenantId: "test-tenant-id",
      email: to,
      firstName: "Test",
      lastName: "User",
      emailVerified: false,
      passwordHash: "",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    let result: boolean;

    switch (type) {
      case "welcome":
        result = await this.emailService.sendWelcomeEmail(
          mockUser,
          "test-verification-token-123",
        );
        break;

      case "verification":
        result = await this.emailService.sendVerificationEmail(
          mockUser,
          "test-verification-token-123",
        );
        break;

      case "password-reset":
        result = await this.emailService.sendPasswordResetEmail(
          mockUser,
          "test-reset-token-123",
        );
        break;

      case "password-changed":
        result = await this.emailService.sendPasswordChangedEmail(mockUser);
        break;

      case "magic-link":
        result = await this.emailService.sendMagicLinkEmail(
          mockUser,
          "test-magic-link-token-123",
        );
        break;

      case "otp":
        result = await this.emailService.sendOTPEmail(mockUser, "123456");
        break;

      case "account-deleted":
        result = await this.emailService.sendAccountDeletedEmail(mockUser);
        break;

      default:
        throw new ApiException("BAD_REQUEST", {
          detail: "Invalid email type. Valid types: welcome, verification, password-reset, password-changed, magic-link, otp, account-deleted",
        });
    }

    return {
      success: result,
      type,
      recipient: to,
      message: result
        ? "Email sent successfully (check console if in development mode)"
        : "Email failed to send",
    };
  }
}
