import {
  applyDecorators,
  CanActivate,
  ExecutionContext,
  Injectable,
  UseGuards,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ApiException } from "../http";

const DEFAULT_RECENT_AUTH_WINDOW_SECONDS = 300;

/**
 * Requires that the session's login (the `authTime` claim, epoch seconds) is
 * within RECENT_AUTH_WINDOW_SECONDS. Use for sensitive actions: change
 * password, disable MFA, delete account. Run it after JwtAuthGuard.
 * A missing claim (token minted before the claim existed) counts as stale.
 */
@Injectable()
export class RecentAuthGuard implements CanActivate {
  private readonly windowSeconds: number;

  constructor(config: ConfigService) {
    this.windowSeconds = config.get<number>(
      "RECENT_AUTH_WINDOW_SECONDS",
      DEFAULT_RECENT_AUTH_WINDOW_SECONDS,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const user = context.switchToHttp().getRequest<{ user?: { authTime?: number } }>().user;
    const authTime = user?.authTime;
    const nowSeconds = Math.floor(Date.now() / 1000);

    if (typeof authTime !== "number" || nowSeconds - authTime > this.windowSeconds) {
      throw new ApiException("ACCESS_RECENT_AUTH_REQUIRED", {
        detail: "Please sign in again to continue.",
      });
    }
    return true;
  }
}

/** Route decorator: `@RequireRecentAuth()` on a handler that follows JwtAuthGuard. */
export const RequireRecentAuth = (): MethodDecorator & ClassDecorator =>
  applyDecorators(UseGuards(RecentAuthGuard));
