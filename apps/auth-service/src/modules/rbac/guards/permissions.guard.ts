import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ApiException } from '../../../common/http';
import { Reflector } from '@nestjs/core';
import { PolicyEvaluationService } from '../services/policy-evaluation.service';
import { RbacService } from '../services/rbac.service';
import { EvaluationContext } from '../types/policy.types';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Resource type segment of an ARN-style resource (`sentry:tenant:<tid>:<type>:<id>`),
 * derived from the permission's namespace ("users:read" -> "user"). System-role
 * policies target resources in this shape (e.g. `sentry:tenant:*:*`).
 */
function resourceTypeOf(permission: string): string {
  const namespace = permission.split(':')[0] ?? '*';
  if (namespace.endsWith('ies')) return `${namespace.slice(0, -3)}y`;
  if (namespace.endsWith('s')) return namespace.slice(0, -1);
  return namespace;
}

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
      throw new ApiException("ACCESS_FORBIDDEN", { detail: 'Authentication required' });
    }

    if (user.isSuperAdmin) {
      return true;
    }

    if (!tenantId) {
      throw new ApiException("ACCESS_FORBIDDEN", { detail: 'Tenant context not found' });
    }

    // Try IAM policy evaluation first
    const policies = await this.policyEvaluationService.collectPolicies(user.sub, tenantId);

    if (policies.length > 0) {
      // IAM policies exist — use policy-based evaluation
      const evaluationContext: EvaluationContext = {
        ipAddress: request.ip ?? '0.0.0.0',
        mfaVerified: !!user.mfaVerified,
      };

      const params = (request.params ?? {}) as Record<string, string | undefined>;
      const resourceId = params.id ?? params.userId ?? params.roleId ?? params.clientId ?? "*";

      for (const permission of requiredPermissions) {
        const resource = `sentry:tenant:${tenantId}:${resourceTypeOf(permission)}:${resourceId}`;

        const result = await this.policyEvaluationService.evaluate({
          userId: user.sub,
          tenantId,
          action: permission,
          resource,
          context: evaluationContext,
        });

        if (!result.allowed) {
          throw new ApiException("ACCESS_FORBIDDEN", {
            detail: `Access denied: ${result.reason}${result.deniedBy?.length ? ` (${result.deniedBy.join(', ')})` : ''}`,
          });
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
        throw new ApiException("ACCESS_FORBIDDEN", { detail: `Access denied: missing permission "${permission}"` });
      }
    }

    return true;
  }
}
