import { SetMetadata } from "@nestjs/common";

/**
 * Metadata key used by guards to identify public (unauthenticated) routes.
 *
 * When a global JwtAuthGuard is added in the future, it should skip routes
 * decorated with @Public() by checking:
 *
 *   const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
 *     context.getHandler(),
 *     context.getClass(),
 *   ]);
 *   if (isPublic) return true;
 */
export const IS_PUBLIC_KEY = "isPublic";

/**
 * Mark a route handler (or entire controller) as publicly accessible.
 *
 * Usage:
 *   @Public()
 *   @Get('initialized')
 *   async checkInitialized() { ... }
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
