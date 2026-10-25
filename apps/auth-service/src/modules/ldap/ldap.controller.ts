import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
} from "@nestjs/common";
import { SessionGuard } from "@/common/guards/session.guard";
import { JwtAuthGuard } from "@/common/guards";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";
import { LdapService } from "./ldap.service";
import { CreateLdapConnectionDto, UpdateLdapConnectionDto } from "./ldap.dto";

interface AuthenticatedRequest {
  tenantId?: string;
  user: { sub: string; tid: string };
}

/** The encrypted bind password must never leave the server (ASVS 8.3.4). */
function withoutBindPassword<T extends { bindPasswordEncrypted?: string }>(
  conn: T,
): Omit<T, "bindPasswordEncrypted"> {
  const { bindPasswordEncrypted: _omit, ...rest } = conn;
  return rest;
}

@Controller("ldap")
@UseGuards(JwtAuthGuard, SessionGuard, PermissionsGuard)
export class LdapController {
  constructor(private readonly ldapService: LdapService) {}

  @Post("connections")
  @RequirePermissions(Permissions.LDAP_WRITE)
  @HttpCode(HttpStatus.CREATED)
  async create(@Request() req: AuthenticatedRequest, @Body() dto: CreateLdapConnectionDto) {
    return withoutBindPassword(await this.ldapService.create(req.tenantId!, dto));
  }

  @Get("connections")
  @RequirePermissions(Permissions.LDAP_READ)
  async list(@Request() req: AuthenticatedRequest) {
    return (await this.ldapService.list(req.tenantId!)).map(withoutBindPassword);
  }

  @Patch("connections/:id")
  @RequirePermissions(Permissions.LDAP_WRITE)
  async update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateLdapConnectionDto,
  ) {
    return withoutBindPassword(await this.ldapService.update(req.tenantId!, id, dto));
  }

  @Delete("connections/:id")
  @RequirePermissions(Permissions.LDAP_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.ldapService.delete(req.tenantId!, id);
  }

  @Post("connections/:id/test")
  @RequirePermissions(Permissions.LDAP_READ)
  test(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.ldapService.testConnection(req.tenantId!, id);
  }

  @Post("connections/:id/sync")
  @RequirePermissions(Permissions.LDAP_WRITE)
  @HttpCode(HttpStatus.ACCEPTED)
  sync(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.ldapService.syncNow(req.tenantId!, id);
  }
}
