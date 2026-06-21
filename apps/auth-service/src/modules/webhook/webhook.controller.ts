import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  Request,
  UseGuards,
  DefaultValuePipe,
} from "@nestjs/common";
import { JwtAuthGuard } from "@/common/guards";
import { PermissionsGuard } from "@/modules/rbac/guards/permissions.guard";
import { RequirePermissions } from "@/modules/rbac/decorators/rbac.decorator";

interface AuthenticatedRequest {
  tenantId?: string;
  user: { sub: string; tid: string };
}
import { WebhookService } from "./webhook.service";
import { CreateWebhookDto, UpdateWebhookDto } from "./webhook.dto";

@Controller("webhooks")
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @RequirePermissions("webhooks:write")
  @HttpCode(HttpStatus.CREATED)
  create(@Request() req: AuthenticatedRequest, @Body() dto: CreateWebhookDto) {
    return this.webhookService.create(req.tenantId!, dto);
  }

  @Get()
  @RequirePermissions("webhooks:read")
  list(@Request() req: AuthenticatedRequest) {
    return this.webhookService.list(req.tenantId!);
  }

  @Get(":id")
  @RequirePermissions("webhooks:read")
  findOne(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.webhookService.findOne(req.tenantId!, id);
  }

  @Patch(":id")
  @RequirePermissions("webhooks:write")
  update(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateWebhookDto,
  ) {
    return this.webhookService.update(req.tenantId!, id, dto);
  }

  @Post(":id/rotate-secret")
  @RequirePermissions("webhooks:write")
  rotateSecret(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.webhookService.rotateSecret(req.tenantId!, id);
  }

  @Delete(":id")
  @RequirePermissions("webhooks:write")
  @HttpCode(HttpStatus.NO_CONTENT)
  delete(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.webhookService.delete(req.tenantId!, id);
  }

  @Get(":id/deliveries")
  @RequirePermissions("webhooks:read")
  getDeliveries(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Query("limit", new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.webhookService.getDeliveries(req.tenantId!, id, limit);
  }

  @Post(":id/deliveries/:deliveryId/redeliver")
  @RequirePermissions("webhooks:write")
  @HttpCode(HttpStatus.ACCEPTED)
  redeliver(
    @Request() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Param("deliveryId") deliveryId: string,
  ) {
    return this.webhookService.redeliver(req.tenantId!, id, deliveryId);
  }

  @Post(":id/test")
  @RequirePermissions("webhooks:write")
  @HttpCode(HttpStatus.ACCEPTED)
  test(@Request() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.webhookService.sendTestEvent(req.tenantId!, id);
  }
}
