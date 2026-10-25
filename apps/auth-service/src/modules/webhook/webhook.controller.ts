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
  Request,
  UseGuards,
} from "@nestjs/common";
import { SessionGuard } from "@/common/guards/session.guard";
import { ApiException } from "@/common/http";
import { JwtAuthGuard } from "@/common/guards";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";
import { Permissions } from "@/modules/rbac/constants/permissions.catalog";
import { WebhookService } from "./webhook.service";
import { CreateWebhookDto, UpdateWebhookDto } from "./webhook.dto";

const DEFAULT_DELIVERY_LIMIT = 50;
const MAX_DELIVERY_LIMIT = 200;

/** The signing secret is revealed only on create/rotate, never on read. */
function withoutSecret<T extends { secret?: string }>(endpoint: T): Omit<T, "secret"> {
  const { secret: _secret, ...rest } = endpoint;
  return rest;
}

interface AuthenticatedRequest {
  tenantId?: string;
  user: { sub: string; tid: string };
}

@Controller("webhooks")
@UseGuards(JwtAuthGuard, SessionGuard, PermissionsGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @RequirePermissions(Permissions.WEBHOOKS_WRITE)
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateWebhookDto) {
    return this.webhookService.create(req.tenantId!, dto);
  }

  @Get()
  @RequirePermissions(Permissions.WEBHOOKS_READ)
  async list(@Request() req: AuthenticatedRequest) {
    return (await this.webhookService.list(req.tenantId!)).map(withoutSecret);
  }

  @Get(":id")
  @RequirePermissions(Permissions.WEBHOOKS_READ)
  async findOne(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return withoutSecret(await this.webhookService.findOne(req.tenantId!, id));
  }

  @Patch(":id")
  @RequirePermissions(Permissions.WEBHOOKS_WRITE)
  async update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return withoutSecret(await this.webhookService.update(req.tenantId!, id, dto));
  }

  @Post(":id/rotate-secret")
  @RequirePermissions(Permissions.WEBHOOKS_WRITE)
  rotateSecret(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.webhookService.rotateSecret(req.tenantId!, id);
  }

  @Delete(":id")
  @RequirePermissions(Permissions.WEBHOOKS_WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.webhookService.delete(req.tenantId!, id);
  }

  @Get(":id/deliveries")
  @RequirePermissions(Permissions.WEBHOOKS_READ)
  getDeliveries(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("limit") rawLimit?: string,
  ) {
    const limit = rawLimit === undefined ? DEFAULT_DELIVERY_LIMIT : Number(rawLimit);
    if (!Number.isInteger(limit) || limit < 1) {
      throw new ApiException("VALIDATION_FAILED", {
        errors: [{ field: "limit", message: "limit must be a positive integer" }],
      });
    }
    return this.webhookService.getDeliveries(req.tenantId!, id, Math.min(limit, MAX_DELIVERY_LIMIT));
  }

  @Post(":id/deliveries/:deliveryId/redeliver")
  @RequirePermissions(Permissions.WEBHOOKS_WRITE)
  @HttpCode(HttpStatus.ACCEPTED)
  redeliver(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("deliveryId") deliveryId: string,
  ) {
    return this.webhookService.redeliver(req.tenantId!, id, deliveryId);
  }

  @Post(":id/test")
  @RequirePermissions(Permissions.WEBHOOKS_WRITE)
  @HttpCode(HttpStatus.ACCEPTED)
  test(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.webhookService.sendTestEvent(req.tenantId!, id);
  }
}
