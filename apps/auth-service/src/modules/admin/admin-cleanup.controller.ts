import {
  Controller,
  Post,
  Get,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from "@nestjs/swagger";
import { TokenCleanupService } from "../auth/token-cleanup.service";
import { Protected } from "@/common/decorators/protected.decorator";
import { RequireRoles } from "@/common/decorators/permission.decorator";

@ApiTags("Admin - Token Cleanup")
@Controller("admin/cleanup")
@Protected()
@RequireRoles("admin", "superadmin")
export class AdminCleanupController {
  constructor(private readonly tokenCleanupService: TokenCleanupService) {}

  /**
   * Trigger manual token cleanup
   */
  @Post("tokens")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Trigger token cleanup",
    description: "Manually trigger token cleanup job (admin only)",
  })
  @ApiQuery({
    name: "tenantId",
    required: false,
    description: "Cleanup tokens for specific tenant (optional)",
  })
  async triggerCleanup(@Query("tenantId") tenantId?: string) {
    const result = await this.tokenCleanupService.manualCleanup(tenantId);

    return {
      message: "Token cleanup completed",
      ...result,
    };
  }

  /**
   * Get cleanup statistics
   */
  @Get("stats")
  @ApiOperation({ summary: "Get cleanup statistics" })
  @ApiQuery({
    name: "tenantId",
    required: false,
    description: "Get stats for specific tenant (optional)",
  })
  async getCleanupStats(@Query("tenantId") tenantId?: string) {
    return this.tokenCleanupService.getCleanupStats(tenantId);
  }
}
