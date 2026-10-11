import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Param,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { MfaService } from "./mfa.service";
import {
  VerifyTotpDto,
  VerifyBackupCodeDto,
  SetupTotpResponseDto,
  MfaStatusDto,
  MfaEnabledResponseDto,
  BackupCodesResponseDto,
  VerifyEmailOtpDto,
} from "./dto/mfa.dto";
import { FinishWebAuthnRegistrationDto } from "./dto/finish-webauthn-registration.dto";
import { JwtAuthGuard } from "@/common/guards";
import { RateLimit } from "@/common/decorators/rate-limit.decorator";
import { EmailOtpService } from "@/modules/mfa/email-otp.service";
import { WebAuthnService } from "@/modules/mfa/webauthn.service";

interface AuthenticatedRequest {
  tenantId: string;
  user: { sub: string; email?: string; mfaVerified?: boolean };
  ip?: string;
  route?: { path: string };
  params?: Record<string, string>;
}

@ApiTags("MFA")
@Controller("mfa")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MfaController {
  constructor(
    private readonly mfaService: MfaService,
    private readonly emailOtpService: EmailOtpService,
    private readonly webauthnService: WebAuthnService,
  ) {}

  // ============================================================
  // TOTP SETUP & MANAGEMENT
  // ============================================================

  /**
   * Setup TOTP (Step 1: Generate QR code)
   */
  @Post("setup/totp")
  @ApiOperation({
    summary: "Setup TOTP MFA",
    description: "Generate QR code and backup codes for TOTP setup",
  })
  @ApiResponse({
    status: 200,
    description: "TOTP setup data",
    type: SetupTotpResponseDto,
  })
  async setupTotp(@Request() req: AuthenticatedRequest): Promise<SetupTotpResponseDto> {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    return this.mfaService.setupTotp(userId, tenantId);
  }

  /**
   * Verify and enable TOTP (Step 2: Verify code from authenticator app)
   */
  @Post("verify/totp")
  @RateLimit({ max: 5, windowMs: 300000, keyBy: "user" })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify and enable TOTP MFA",
    description: "Verify TOTP code and enable MFA",
  })
  @ApiResponse({
    status: 200,
    description: "TOTP enabled successfully",
    type: MfaEnabledResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "TOTP not setup or already enabled",
  })
  @ApiResponse({ status: 401, description: "Invalid TOTP code" })
  async verifyAndEnableTotp(
    @Request() req: AuthenticatedRequest,
    @Body() dto: VerifyTotpDto,
  ): Promise<MfaEnabledResponseDto> {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const { backupCodes } = await this.mfaService.verifyAndEnableTotp(
      userId,
      tenantId,
      dto.token,
    );

    return {
      message: "TOTP MFA enabled successfully",
      backupCodes,
    };
  }

  /**
   * Disable TOTP MFA
   */
  @Delete("totp")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Disable TOTP MFA",
    description: "Turn off TOTP-based MFA",
  })
  @ApiResponse({ status: 200, description: "TOTP disabled" })
  async disableTotp(@Request() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    await this.mfaService.disableTotp(userId, tenantId);

    return { message: "TOTP MFA disabled successfully" };
  }

  // ============================================================
  // BACKUP CODES
  // ============================================================

  /**
   * Regenerate backup codes
   */
  @Post("backup-codes/regenerate")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Regenerate backup codes",
    description: "Generate new backup codes (invalidates old ones)",
  })
  @ApiResponse({
    status: 200,
    description: "New backup codes generated",
    type: BackupCodesResponseDto,
  })
  @ApiResponse({ status: 400, description: "MFA must be enabled first" })
  async regenerateBackupCodes(
    @Request() req: AuthenticatedRequest,
  ): Promise<BackupCodesResponseDto> {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const backupCodes = await this.mfaService.regenerateBackupCodes(
      userId,
      tenantId,
    );

    return {
      backupCodes,
      count: backupCodes.length,
    };
  }

  /**
   * Verify backup code (for testing)
   */
  @Post("verify/backup-code")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Verify backup code",
    description: "Test a backup code (consumes it if valid)",
  })
  @ApiResponse({ status: 200, description: "Backup code verified" })
  @ApiResponse({ status: 401, description: "Invalid backup code" })
  async verifyBackupCode(
    @Request() req: AuthenticatedRequest,
    @Body() dto: VerifyBackupCodeDto,
  ) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const verified = await this.mfaService.verifyBackupCode(
      userId,
      tenantId,
      dto.code,
    );

    if (!verified) {
      return { valid: false, message: "Invalid backup code" };
    }

    return { valid: true, message: "Backup code verified and consumed" };
  }

  // ============================================================
  // MFA STATUS
  // ============================================================

  /**
   * Get MFA status
   */
  @Get("status")
  @ApiOperation({
    summary: "Get MFA status",
    description: "Check which MFA methods are enabled",
  })
  @ApiResponse({
    status: 200,
    description: "MFA status",
    type: MfaStatusDto,
  })
  async getMfaStatus(@Request() req: AuthenticatedRequest): Promise<MfaStatusDto> {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    return this.mfaService.getMfaStatus(
      userId,
      tenantId,
    ) as unknown as MfaStatusDto;
  }

  /**
   * Disable all MFA methods
   */
  @Delete("all")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Disable all MFA",
    description: "Turn off all MFA methods",
  })
  @ApiResponse({ status: 200, description: "All MFA disabled" })
  async disableAllMfa(@Request() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    await this.mfaService.disableAllMfa(userId, tenantId);

    return { message: "All MFA methods disabled successfully" };
  }

  /**
   * Request email OTP
   */
  @Post("request-email-otp")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Request OTP code via email",
    description: "Send a 6-digit code to user email for MFA",
  })
  async requestEmailOtp(@Request() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    // Send OTP
    await this.emailOtpService.sendOtp(userId, tenantId);

    return {
      message: "OTP code sent to your email",
      expiresIn: "10 minutes",
    };
  }

  /**
   * Verify email OTP
   */
  @Post("verify-email-otp")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Verify email OTP code",
    description: "Verify the 6-digit code received via email",
  })
  async verifyEmailOtp(@Request() req: AuthenticatedRequest, @Body() dto: VerifyEmailOtpDto) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const verified = await this.emailOtpService.verifyOtp(
      userId,
      tenantId,
      dto.code,
    );

    if (!verified) {
      throw new UnauthorizedException("Invalid or expired OTP code");
    }

    return { message: "Email OTP verified" };
  }

  /**
   * Start WebAuthn registration
   */
  @Post("webauthn/register/start")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Start WebAuthn credential registration" })
  async startWebAuthnRegistration(@Request() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const options = await this.webauthnService.startRegistration(
      userId,
      tenantId,
    );
    return options;
  }

  /**
   * Finish WebAuthn registration
   */
  @Post("webauthn/register/finish")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Finish WebAuthn credential registration" })
  async finishWebAuthnRegistration(
    @Request() req: AuthenticatedRequest,
    @Body() body: FinishWebAuthnRegistrationDto,
  ) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const result = await this.webauthnService.finishRegistration(
      userId,
      tenantId,
      body.response as unknown as import("@simplewebauthn/server").RegistrationResponseJSON,
      body.deviceName,
    );

    return {
      success: true,
      credentialId: result.credentialId,
      message: "Passkey registered successfully",
    };
  }

  /**
   * List WebAuthn credentials
   */
  @Get("webauthn/credentials")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "List user WebAuthn credentials" })
  async listWebAuthnCredentials(@Request() req: AuthenticatedRequest) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const credentials = await this.webauthnService.listCredentials(
      userId,
      tenantId,
    );
    return { credentials };
  }

  /**
   * Delete WebAuthn credential
   */
  @Delete("webauthn/credentials/:credentialId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Delete WebAuthn credential" })
  async deleteWebAuthnCredential(
    @Request() req: AuthenticatedRequest,
    @Param("credentialId") credentialId: string,
  ) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    await this.webauthnService.deleteCredential(userId, tenantId, credentialId);

    return {
      success: true,
      message: "Passkey deleted successfully",
    };
  }
  //
  // /**
  //  * Unified MFA verification endpoint
  //  * Supports: TOTP, Email OTP, SMS OTP, Backup Codes
  //  */
  // @Post('mfa/verify')
  // @HttpCode(HttpStatus.OK)
  // @ApiOperation({
  //   summary: 'Verify MFA using any enabled method',
  //   description: 'Universal MFA verification endpoint'
  // })
  // @ApiBody({
  //   schema: {
  //     type: 'object',
  //     properties: {
  //       tempToken: { type: 'string', description: 'Temporary token from login' },
  //       method: {
  //         type: 'string',
  //         enum: ['totp', 'email', 'sms', 'backup_code'],
  //         description: 'MFA method to use'
  //       },
  //       code: {
  //         type: 'string',
  //         description: '6-digit code or backup code',
  //         example: '123456'
  //       },
  //     },
  //     required: ['tempToken', 'method', 'code'],
  //   },
  // })
  // async verifyMfaUnified(
  //   @Req() req: Request,
  //   @Body() dto: {
  //     tempToken: string;
  //     method: 'totp' | 'email' | 'sms' | 'backup_code';
  //     code: string;
  //   },
  //   @Ip() ip: string,
  //   @Headers('user-agent') userAgent: string,
  // ) {
  //   const tenantId = req.tenantId!;
  //
  //   try {
  //     // Step 1: Verify temporary token
  //     const payload = this.jwtService.verify(dto.tempToken, {
  //       secret: this.configService.get('JWT_SECRET'),
  //     });
  //
  //     if (payload.type !== 'mfa_pending') {
  //       throw new UnauthorizedException('Invalid token type');
  //     }
  //
  //     console.log(`🔐 Verifying MFA using method: ${dto.method}`);
  //
  //     // Step 2: Verify based on method
  //     let verified = false;
  //
  //     switch (dto.method) {
  //       case 'totp':
  //         verified = await this.mfaService.verifyTotp(
  //           payload.sub,
  //           tenantId,
  //           dto.code,
  //         );
  //         break;
  //
  //       case 'email':
  //         verified = await this.emailOtpService.verifyOtp(
  //           payload.sub,
  //           tenantId,
  //           dto.code,
  //         );
  //         break;
  //
  //       case 'sms':
  //         // TODO: Implement SMS OTP verification
  //         verified = await this.smsOtpService.verifyOtp(
  //           payload.sub,
  //           tenantId,
  //           dto.code,
  //         );
  //         break;
  //
  //       case 'backup_code':
  //         verified = await this.mfaService.verifyBackupCode(
  //           payload.sub,
  //           tenantId,
  //           dto.code,
  //         );
  //         break;
  //
  //       default:
  //         throw new BadRequestException('Invalid MFA method');
  //     }
  //
  //     if (!verified) {
  //       throw new UnauthorizedException(`Invalid ${dto.method} code`);
  //     }
  //
  //     // Step 3: Generate real session and tokens
  //     const familyId = uuidv4();
  //     const refreshToken = crypto.randomBytes(32).toString('hex');
  //     const refreshTokenHash = crypto
  //       .createHash('sha256')
  //       .update(refreshToken)
  //       .digest('hex');
  //
  //     const session = await this.sessionService.createSession({
  //       userId: payload.sub,
  //       tenantId,
  //       email: payload.email,
  //       refreshTokenFamilyId: familyId,
  //       refreshTokenHash,
  //       ipAddress: ip,
  //       userAgent: userAgent || 'unknown',
  //     });
  //
  //     const accessToken = this.jwtService.sign(
  //       {
  //         sub: payload.sub,
  //         email: payload.email,
  //         tenantId,
  //         sessionId: session.id,
  //       },
  //       {
  //         secret: this.configService.get('JWT_SECRET'),
  //         expiresIn: '15m',
  //       },
  //     );
  //
  //     console.log(`✅ MFA verified via ${dto.method} for ${payload.email}`);
  //
  //     return {
  //       accessToken,
  //       refreshToken,
  //       message: 'MFA verified successfully',
  //       method: dto.method,
  //     };
  //   } catch (error) {
  //     console.error('❌ MFA verification failed:', error.message);
  //
  //     if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
  //       throw error;
  //     }
  //
  //     throw new UnauthorizedException('Invalid or expired token');
  //   }
  // }
}
