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

@Controller("ldap")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class LdapController {
  constructor(private readonly ldapService: LdapService) {}

  @Post("connections")
  @RequirePermissions(Permissions.LDAP_WRITE)
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateLdapConnectionDto) {
    return this.ldapService.create(req.tenantId!, dto);
  }

  @Get("connections")
  @RequirePermissions(Permissions.LDAP_READ)
  list(@Request() req: AuthenticatedRequest) {
    return this.ldapService.list(req.tenantId!);
  }

  @Patch("connections/:id")
  @RequirePermissions(Permissions.LDAP_WRITE)
  update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateLdapConnectionDto,
  ) {
    return this.ldapService.update(req.tenantId!, id, dto);
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
