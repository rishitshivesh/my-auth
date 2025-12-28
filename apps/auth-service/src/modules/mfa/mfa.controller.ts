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
} from "./dto/mfa.dto";
import { JwtAuthGuard } from "@/common/guards";

@ApiTags("MFA")
@Controller("mfa")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

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
  async setupTotp(@Request() req: any): Promise<SetupTotpResponseDto> {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    return this.mfaService.setupTotp(userId, tenantId);
  }

  /**
   * Verify and enable TOTP (Step 2: Verify code from authenticator app)
   */
  @Post("verify/totp")
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
    @Request() req: any,
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
  async disableTotp(@Request() req: any) {
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
    @Request() req: any,
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
    @Request() req: any,
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
  async getMfaStatus(@Request() req: any): Promise<MfaStatusDto> {
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
  async disableAllMfa(@Request() req: any) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    await this.mfaService.disableAllMfa(userId, tenantId);

    return { message: "All MFA methods disabled successfully" };
  }
}
