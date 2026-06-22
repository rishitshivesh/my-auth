import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
  Header,
} from "@nestjs/common";
import type { Request as ExpressRequest } from "express";
import { JwtAuthGuard } from "@/common/guards";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";
import { ScimService } from "./scim.service";

interface AuthenticatedRequest {
  tenantId?: string;
  user: { sub: string; tid: string };
}
import { ScimTokenService } from "./scim-token.service";
import { ScimAuthGuard } from "./scim.guard";
import {
  ScimUser,
  ScimGroup,
  ScimPatchRequest,
  SCIM_SCHEMA_LIST,
} from "./scim.types";
import { IsString, IsOptional, IsInt, Min, Max, IsNumber } from "class-validator";

class CreateScimTokenDto {
  @IsString() name!: string;
  @IsOptional() @IsNumber() expiresInDays?: number;
}

@Controller("scim")
export class ScimController {
  constructor(
    private readonly scimService: ScimService,
    private readonly scimTokenService: ScimTokenService,
  ) {}

  // ── Token management (JWT auth) ────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Post("tokens")
  @RequirePermissions(Permissions.SCIM_WRITE)
  @HttpCode(HttpStatus.CREATED)
  createToken(@Request() req: AuthenticatedRequest, @Body() dto: CreateScimTokenDto) {
    return this.scimTokenService.createToken(req.tenantId!, dto.name, dto.expiresInDays);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Get("tokens")
  @RequirePermissions(Permissions.SCIM_READ)
  listTokens(@Request() req: AuthenticatedRequest) {
    return this.scimTokenService.listTokens(req.tenantId!);
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Delete("tokens/:id")
  @RequirePermissions(Permissions.SCIM_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  revokeToken(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.scimTokenService.revokeToken(req.tenantId!, id);
  }

  // ── SCIM v2 Users (SCIM Bearer token auth) ────────────────────────────────

  @UseGuards(ScimAuthGuard)
  @Get("v2/Users")
  @Header("Content-Type", "application/scim+json")
  listUsers(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Query("startIndex") startIndex?: string,
    @Query("count") count?: string,
    @Query("filter") filter?: string,
  ) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return this.scimService.listUsers(
      req.scimTenantId,
      baseUrl,
      startIndex ? parseInt(startIndex, 10) : 1,
      count ? parseInt(count, 10) : 100,
      filter,
    );
  }

  @UseGuards(ScimAuthGuard)
  @Get("v2/Users/:id")
  @Header("Content-Type", "application/scim+json")
  getUser(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Param("id") id: string,
  ) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return this.scimService.getUser(req.scimTenantId, id, baseUrl);
  }

  @UseGuards(ScimAuthGuard)
  @Post("v2/Users")
  @Header("Content-Type", "application/scim+json")
  @HttpCode(HttpStatus.CREATED)
  createUser(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Body() body: object,
  ) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return this.scimService.createUser(req.scimTenantId, body as ScimUser, baseUrl);
  }

  @UseGuards(ScimAuthGuard)
  @Put("v2/Users/:id")
  @Header("Content-Type", "application/scim+json")
  replaceUser(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Param("id") id: string,
    @Body() body: object,
  ) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return this.scimService.replaceUser(req.scimTenantId, id, body as ScimUser, baseUrl);
  }

  @UseGuards(ScimAuthGuard)
  @Patch("v2/Users/:id")
  @Header("Content-Type", "application/scim+json")
  patchUser(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Param("id") id: string,
    @Body() body: object,
  ) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return this.scimService.patchUser(req.scimTenantId, id, (body as ScimPatchRequest).Operations, baseUrl);
  }

  @UseGuards(ScimAuthGuard)
  @Delete("v2/Users/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Param("id") id: string,
  ) {
    return this.scimService.deleteUser(req.scimTenantId, id);
  }

  // ── SCIM v2 Groups ────────────────────────────────────────────────────────

  @UseGuards(ScimAuthGuard)
  @Get("v2/Groups")
  @Header("Content-Type", "application/scim+json")
  listGroups(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Query("startIndex") startIndex?: string,
    @Query("count") count?: string,
  ) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return this.scimService.listGroups(
      req.scimTenantId,
      baseUrl,
      startIndex ? parseInt(startIndex, 10) : 1,
      count ? parseInt(count, 10) : 100,
    );
  }

  @UseGuards(ScimAuthGuard)
  @Get("v2/Groups/:id")
  @Header("Content-Type", "application/scim+json")
  getGroup(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Param("id") id: string,
  ) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return this.scimService.getGroup(req.scimTenantId, id, baseUrl);
  }

  @UseGuards(ScimAuthGuard)
  @Post("v2/Groups")
  @Header("Content-Type", "application/scim+json")
  @HttpCode(HttpStatus.CREATED)
  createGroup(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Body() body: object,
  ) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return this.scimService.createGroup(req.scimTenantId, body as ScimGroup, baseUrl);
  }

  @UseGuards(ScimAuthGuard)
  @Patch("v2/Groups/:id")
  @Header("Content-Type", "application/scim+json")
  patchGroup(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Param("id") id: string,
    @Body() body: object,
  ) {
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    return this.scimService.patchGroup(req.scimTenantId, id, (body as ScimPatchRequest).Operations, baseUrl);
  }

  @UseGuards(ScimAuthGuard)
  @Delete("v2/Groups/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteGroup(
    @Request() req: ExpressRequest & { scimTenantId: string },
    @Param("id") id: string,
  ) {
    return this.scimService.deleteGroup(req.scimTenantId, id);
  }

  // ── SCIM ServiceProviderConfig ────────────────────────────────────────────

  @UseGuards(ScimAuthGuard)
  @Get("v2/ServiceProviderConfig")
  @Header("Content-Type", "application/scim+json")
  serviceProviderConfig() {
    return {
      schemas: ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
      patch: { supported: true },
      bulk: { supported: false, maxOperations: 0, maxPayloadSize: 0 },
      filter: { supported: true, maxResults: 200 },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: "oauthbearertoken",
          name: "OAuth Bearer Token",
          description: "Authentication scheme using the OAuth Bearer Token Standard",
        },
      ],
    };
  }
}
