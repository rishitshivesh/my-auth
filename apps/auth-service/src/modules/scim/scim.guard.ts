import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from "@nestjs/common";
import { Request } from "express";
import { ScimTokenService } from "./scim-token.service";

@Injectable()
export class ScimAuthGuard implements CanActivate {
  constructor(private readonly scimTokenService: ScimTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { scimTenantId?: string }>();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("SCIM requests require a Bearer token");
    }

    const rawToken = authHeader.slice(7);
    const record = await this.scimTokenService.validateToken(rawToken);

    request.scimTenantId = record.tenantId;
    return true;
  }
}
