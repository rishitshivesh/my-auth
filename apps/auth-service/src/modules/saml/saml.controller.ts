import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Header,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
  Res,
} from "@nestjs/common";
import type { Response } from "express";
import { JwtAuthGuard } from "@/common/guards";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Public } from "@/common/decorators/public.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";
import { SamlService } from "./saml.service";

interface AuthenticatedRequest {
  tenantId?: string;
  user: { sub: string; tid: string };
}
import { RegisterSPDto, UpdateSPDto } from "./saml.dto";

@Controller("saml")
export class SamlController {
  constructor(private readonly samlService: SamlService) {}

  // ── Public IdP metadata ──────────────────────────────────────────────────────

  @Public()
  @Get("metadata/:tenantSlug")
  @Header("Content-Type", "application/xml")
  getMetadata(@Param("tenantSlug") tenantSlug: string) {
    return this.samlService.getIdpMetadata(tenantSlug);
  }

  // ── SP-initiated SSO — POST binding ─────────────────────────────────────────

  @Public()
  @Post("sso/:spId")
  @HttpCode(HttpStatus.OK)
  async handlePostSSO(
    @Param("spId") spId: string,
    @Body("SAMLRequest") samlRequest: string,
    @Body("RelayState") relayState: string,
    @Res() res: Response,
  ) {
    // In a real flow: parse SAMLRequest, verify, get authenticated user from session,
    // build assertion. For now: redirect to login with callback.
    // SPRINT_N: wire session lookup and assertion generation here.
    res.redirect(`/u/login?saml_sp=${spId}&relay=${encodeURIComponent(relayState ?? "")}`);
  }

  // ── SP Management (authenticated) ────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get("sps")
  @RequirePermissions(Permissions.SAML_READ)
  listSPs(@Request() req: AuthenticatedRequest) {
    return this.samlService.listSPs(req.tenantId!);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post("sps")
  @RequirePermissions(Permissions.SAML_WRITE)
  @HttpCode(HttpStatus.CREATED)
  registerSP(@Request() req: AuthenticatedRequest, @Body() dto: RegisterSPDto) {
    return this.samlService.registerSP(req.tenantId!, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Patch("sps/:id")
  @RequirePermissions(Permissions.SAML_WRITE)
  updateSP(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateSPDto,
  ) {
    return this.samlService.updateSP(req.tenantId!, id, dto);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Delete("sps/:id")
  @RequirePermissions(Permissions.SAML_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteSP(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.samlService.deleteSP(req.tenantId!, id);
  }
}
