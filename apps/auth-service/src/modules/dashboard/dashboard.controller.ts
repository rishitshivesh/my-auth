import { Controller, Get, Request } from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, IsNull } from "typeorm";
import { User, Session } from "@repo/database";
import { Protected } from "@/common/decorators/protected.decorator";
import { MfaService } from "@/modules/mfa/mfa.service";

@ApiTags("Dashboard")
@Controller("dashboard")
@Protected()
export class DashboardController {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    private readonly mfaService: MfaService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Get dashboard overview for current user" })
  async getOverview(@Request() req: any) {
    const userId = req.user.sub;
    const tenantId = req.tenantId!;

    const [user, mfaStatus, activeSessions] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId, tenantId } }),
      this.mfaService.getMfaStatus(userId, tenantId),
      this.sessionRepository.count({
        where: { userId, tenantId, revokedAt: IsNull() },
      }),
    ]);

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
      mfa: mfaStatus,
      stats: {
        activeSessions,
        lastLoginAt: user?.lastLoginAt,
      },
    };
  }
}
