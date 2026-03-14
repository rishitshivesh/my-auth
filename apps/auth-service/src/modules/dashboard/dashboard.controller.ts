import { Controller, Get, Request } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { User, Session, MfaSettings } from "@repo/database";
import { Protected } from "@/common/decorators/protected.decorator";

@ApiTags("Dashboard")
@Controller("dashboard")
@Protected()
export class DashboardController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(MfaSettings)
    private readonly mfaRepository: Repository<MfaSettings>,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get dashboard overview for current user" })
  async getOverview(@Request() req: any) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const [user, mfaSettings] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId, tenantId } }),
      this.mfaRepository
        .createQueryBuilder("mfa")
        .addSelect("mfa.backupCodes")
        .where("mfa.userId = :userId AND mfa.tenantId = :tenantId", {
          userId,
          tenantId,
        })
        .getOne(),
    ]);

    // Count active sessions — revokedAt IS NULL means session is active
    const activeSessions = await this.sessionRepository.count({
      where: { userId, tenantId, revokedAt: IsNull() },
    });

    return {
      user: {
        id: user?.id,
        email: user?.email,
        firstName: user?.firstName,
        lastName: user?.lastName,
        displayName: user?.displayName,
        avatarUrl: user?.avatarUrl,
        emailVerified: user?.emailVerified,
        lastLoginAt: user?.lastLoginAt,
        createdAt: user?.createdAt,
        primaryAuthMethod: user?.primaryAuthMethod,
        status: user?.status,
      },
      mfa: {
        enabled: mfaSettings?.totpEnabled ?? false,
        totpEnabled: mfaSettings?.totpEnabled ?? false,
        emailOtpEnabled: mfaSettings?.emailEnabled ?? false,
        backupCodesCount: mfaSettings?.backupCodes?.length ?? 0,
      },
      stats: {
        activeSessions,
        lastLoginAt: user?.lastLoginAt,
      },
    };
  }
}
