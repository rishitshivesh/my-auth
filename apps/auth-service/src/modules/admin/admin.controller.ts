import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { ApiTags, ApiOperation } from "@nestjs/swagger";
import { Protected } from "@/common/decorators/protected.decorator";
import { AdminService } from "./admin.service";

@ApiTags("Admin - Platform")
@Controller("admin")
@Protected()
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  // ─── Platform Metrics ─────────────────────────────────────────

  @Get("dashboard")
  @ApiOperation({ summary: "Get platform-wide metrics for Fort Knox operators" })
  async getPlatformMetrics() {
    return this.adminService.getPlatformMetrics();
  }

  // ─── Tenant Management ─────────────────────────────────────────

  @Get("tenants")
  @ApiOperation({ summary: "List all tenants on the platform" })
  async listTenants(
    @Query("search") search?: string,
    @Query("status") status?: string,
    @Query("plan") plan?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string,
  ) {
    return this.adminService.listTenants({
      search,
      status,
      plan,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? Math.min(parseInt(limit, 10), 100) : 20,
    });
  }

  @Get("tenants/check-slug")
  @ApiOperation({ summary: "Check tenant slug availability" })
  async checkSlug(@Query("slug") slug: string) {
    return this.adminService.checkSlugAvailability(slug ?? "");
  }

  @Get("tenants/:id")
  @ApiOperation({ summary: "Get tenant detail by ID" })
  async getTenant(@Param("id") id: string) {
    return this.adminService.getTenantById(id);
  }

  @Post("tenants")
  @ApiOperation({ summary: "Create a new tenant" })
  async createTenant(
    @Body()
    body: {
      name: string;
      slug: string;
      plan?: string;
      ownerEmail?: string;
      environment?: string;
    },
  ) {
    return this.adminService.createTenant(body);
  }

  @Patch("tenants/:id")
  @ApiOperation({ summary: "Update tenant (status, name, plan)" })
  async updateTenant(
    @Param("id") id: string,
    @Body() body: { status?: string; name?: string; plan?: string },
  ) {
    return this.adminService.updateTenant(id, body);
  }

  @Delete("tenants/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Delete tenant permanently" })
  async deleteTenant(@Param("id") id: string) {
    await this.adminService.deleteTenant(id);
  }

  // ─── Platform Activity ─────────────────────────────────────────

  @Get("activity")
  @ApiOperation({ summary: "Recent security events across all tenants" })
  async getActivity(@Query("limit") limitStr?: string) {
    const limit = limitStr ? Math.min(parseInt(limitStr, 10), 100) : 20;
    return this.adminService.getRecentActivity(limit);
  }

  // ─── Team Management ────────────────────────────────────────────

  @Get("team")
  @ApiOperation({ summary: "List fortknox-internal team members" })
  async getTeam() {
    return this.adminService.getTeamMembers();
  }

  @Post("team")
  @ApiOperation({ summary: "Add a user to the fortknox-internal team" })
  async addTeamMember(@Body() body: { email: string }) {
    return this.adminService.addTeamMember(body.email);
  }

  @Delete("team/:userId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove a user from the fortknox-internal team" })
  async removeTeamMember(@Param("userId") userId: string) {
    await this.adminService.removeTeamMember(userId);
  }

  // ─── Platform Settings ───────────────────────────────────────────

  @Get("settings")
  @ApiOperation({ summary: "Get platform settings" })
  async getSettings() {
    return this.adminService.getPlatformSettings();
  }

  @Patch("settings")
  @ApiOperation({ summary: "Update platform settings" })
  async updateSettings(
    @Body()
    body: {
      platformName?: string;
      smtpHost?: string;
      supportEmail?: string;
      allowPublicSignup?: boolean;
      maintenanceMode?: boolean;
    },
  ) {
    return this.adminService.updatePlatformSettings(body);
  }
}
