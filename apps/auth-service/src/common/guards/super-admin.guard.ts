import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { ApiException } from "../http";

/**
 * Restricts a route to platform operators (Scrolloop Sentry internal team).
 * Run after JwtAuthGuard, which sets `request.user.isSuperAdmin`.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const user = context
      .switchToHttp()
      .getRequest<{ user?: { isSuperAdmin?: boolean } }>().user;
    if (!user) {
      // Guard order across stacked @UseGuards decorators is not guaranteed.
      throw new ApiException("AUTH_TOKEN_INVALID");
    }
    if (user.isSuperAdmin !== true) {
      throw new ApiException("ACCESS_FORBIDDEN", {
        detail: "Platform administrator access required",
      });
    }
    return true;
  }
}
