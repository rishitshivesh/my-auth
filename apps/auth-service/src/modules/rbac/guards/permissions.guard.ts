import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PolicyEvaluationService } from '../services/policy-evaluation.service';
import { EvaluationContext } from '../types/policy.types';

export const PERMISSIONS_KEY = 'permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private policyEvaluationService: PolicyEvaluationService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const tenantId = request.tenantId;

    if (!user?.sub || !tenantId) {
      throw new ForbiddenException('Authentication required');
    }

    const evaluationContext: EvaluationContext = {
      ipAddress: request.ip ?? '0.0.0.0',
      mfaVerified: !!user.mfaVerified,
    };

    const controllerPath = request.route?.path ?? request.path;
    const resourceId = request.params?.id;

    for (const permission of requiredPermissions) {
      const resource = `sentry:tenant:${tenantId}/${controllerPath}${resourceId ? `/${resourceId}` : ''}`;

      const result = await this.policyEvaluationService.evaluate({
        userId: user.sub,
        tenantId,
        action: permission,
        resource,
        context: evaluationContext,
      });

      if (!result.allowed) {
        throw new ForbiddenException(
          `Access denied: ${result.reason}${result.deniedBy?.length ? ` (${result.deniedBy.join(', ')})` : ''}`,
        );
      }
    }

    return true;
  }
}
