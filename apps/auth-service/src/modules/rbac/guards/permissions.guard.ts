import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PolicyEvaluationService } from '../services/policy-evaluation.service';
import { RbacService } from '../services/rbac.service';
import { EvaluationContext } from '../types/policy.types';

export const PERMISSIONS_KEY = 'permissions';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private policyEvaluationService: PolicyEvaluationService,
    private rbacService: RbacService,
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

    if (!user || !user.sub) {
      throw new ForbiddenException('Authentication required');
    }

    if (user.isSuperAdmin) {
      return true;
    }

    if (!tenantId) {
      throw new ForbiddenException('Tenant context not found');
    }

    // Try IAM policy evaluation first
    const policies = await this.policyEvaluationService.collectPolicies(user.sub, tenantId);

    if (policies.length > 0) {
      // IAM policies exist — use policy-based evaluation
      const evaluationContext: EvaluationContext = {
        ipAddress: request.ip ?? '0.0.0.0',
        mfaVerified: !!user.mfaVerified,
      };

      const rawPath: string = request.route?.path ?? request.path;
      const controllerPath = rawPath.replace(/^\/+/, '');
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

    // Fallback to legacy role-based permission check when no IAM policies are configured
    for (const permission of requiredPermissions) {
      const hasPermission = await this.rbacService.userHasPermission(
        user.sub,
        tenantId,
        permission,
      );
      if (!hasPermission) {
        throw new ForbiddenException(
          `Access denied: missing permission "${permission}"`,
        );
      }
    }

    return true;
  }
}
