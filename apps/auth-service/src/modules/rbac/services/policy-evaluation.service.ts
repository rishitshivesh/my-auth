import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  Policy,
  UserRole,
  UserGroup,
  UserPolicy,
  GroupPolicy,
  RolePolicy,
  Group,
  Role,
} from '@repo/database';
import { RbacCacheService } from './rbac-cache.service';
import {
  PolicyDocument,
  PolicyStatement,
  PolicyCondition,
  EvaluationRequest,
  EvaluationResult,
  EvaluationContext,
  SimulationRequest,
  SimulationResult,
  TraceEntry,
} from '../types/policy.types';
import { logger } from '@/common/logger';

@Injectable()
export class PolicyEvaluationService {
  constructor(
    @InjectRepository(Policy) private policyRepo: Repository<Policy>,
    @InjectRepository(UserRole) private userRoleRepo: Repository<UserRole>,
    @InjectRepository(UserGroup) private userGroupRepo: Repository<UserGroup>,
    @InjectRepository(UserPolicy) private userPolicyRepo: Repository<UserPolicy>,
    @InjectRepository(GroupPolicy) private groupPolicyRepo: Repository<GroupPolicy>,
    @InjectRepository(RolePolicy) private rolePolicyRepo: Repository<RolePolicy>,
    @InjectRepository(Group) private groupRepo: Repository<Group>,
    @InjectRepository(Role) private roleRepo: Repository<Role>,
    private cacheService: RbacCacheService,
  ) {}

  async evaluate(request: EvaluationRequest): Promise<EvaluationResult> {
    const { userId, tenantId, action, resource, context } = request;

    const policies = await this.collectPolicies(userId, tenantId);

    let explicitAllow = false;
    const deniedBy: string[] = [];
    const allowedBy: string[] = [];

    const substitutionVars: Record<string, string> = {
      'sentry:UserId': userId,
      'sentry:TenantId': tenantId,
    };

    for (const policy of policies) {
      for (const statement of policy.document.Statement) {
        if (!this.matchesAction(statement.Action, action)) continue;
        const substitutedResource = this.substituteResourceVars(statement.Resource, substitutionVars);
        if (!this.matchesResource(substitutedResource, resource)) continue;
        if (!this.evaluateConditions(statement.Condition, context)) continue;

        if (statement.Effect === 'Deny') {
          deniedBy.push(`${policy.name}:${statement.Sid ?? 'unnamed'}`);
        } else {
          explicitAllow = true;
          allowedBy.push(`${policy.name}:${statement.Sid ?? 'unnamed'}`);
        }
      }
    }

    if (deniedBy.length > 0) {
      return { allowed: false, reason: 'explicit_deny', deniedBy };
    }

    if (explicitAllow) {
      const boundaryResult = await this.checkPermissionBoundary(userId, tenantId, action, resource, context);
      if (boundaryResult && !boundaryResult.allowed) {
        return { allowed: false, reason: 'boundary_deny', deniedBy: boundaryResult.deniedBy };
      }
      return { allowed: true, reason: 'explicit_allow', allowedBy };
    }

    return { allowed: false, reason: 'implicit_deny', deniedBy: [], allowedBy: [] };
  }

  async simulate(request: SimulationRequest): Promise<SimulationResult> {
    const policies = await this.collectPolicies(request.userId, request.tenantId);
    const trace: TraceEntry[] = [];

    const substitutionVars: Record<string, string> = {
      'sentry:UserId': request.userId,
      'sentry:TenantId': request.tenantId,
    };

    for (const policy of policies) {
      for (const statement of policy.document.Statement) {
        const actionMatch = this.matchesAction(statement.Action, request.action);
        const substitutedResource = this.substituteResourceVars(statement.Resource, substitutionVars);
        const resourceMatch = this.matchesResource(substitutedResource, request.resource);
        const conditionMatch = this.evaluateConditions(statement.Condition, request.context);

        trace.push({
          policyName: policy.name,
          statementSid: statement.Sid,
          effect: statement.Effect,
          actionMatch,
          resourceMatch,
          conditionMatch,
          applies: actionMatch && resourceMatch && conditionMatch,
        });
      }
    }

    const result = await this.evaluate(request);
    return { ...result, trace, policiesEvaluated: policies.length };
  }

  private matchesAction(pattern: string | string[], action: string): boolean {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    return patterns.some(p => this.wildcardMatch(p, action));
  }

  private matchesResource(pattern: string | string[], resource: string): boolean {
    const patterns = Array.isArray(pattern) ? pattern : [pattern];
    return patterns.some(p => p === '*' || this.wildcardMatch(p, resource));
  }

  private substituteResourceVars(
    pattern: string | string[],
    vars: Record<string, string>,
  ): string | string[] {
    const substitute = (p: string): string =>
      p.replace(/\$\{([^}]+)\}/g, (_, key: string) => vars[key] ?? `\${${key}}`);
    return Array.isArray(pattern) ? pattern.map(substitute) : substitute(pattern);
  }

  wildcardMatch(pattern: string, value: string): boolean {
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    return new RegExp(`^${escaped}$`).test(value);
  }

  evaluateConditions(
    condition: PolicyCondition | undefined,
    context: EvaluationContext,
  ): boolean {
    if (!condition) return true;

    if (condition.IpAddress) {
      const allowedIps = condition.IpAddress['sentry:SourceIp'];
      const ips = Array.isArray(allowedIps) ? allowedIps : [allowedIps];
      if (!ips.some(ip => this.matchesCidr(context.ipAddress, ip))) {
        return false;
      }
    }

    if (condition.Bool?.['sentry:MultiFactorAuthPresent'] !== undefined) {
      if (condition.Bool['sentry:MultiFactorAuthPresent'] !== context.mfaVerified) {
        return false;
      }
    }

    if (condition.DateGreaterThan) {
      const threshold = new Date(condition.DateGreaterThan['sentry:CurrentTime']);
      const now = context.timestamp ? new Date(context.timestamp) : new Date();
      if (now <= threshold) return false;
    }

    if (condition.DateLessThan) {
      const threshold = new Date(condition.DateLessThan['sentry:CurrentTime']);
      const now = context.timestamp ? new Date(context.timestamp) : new Date();
      if (now >= threshold) return false;
    }

    if (condition.StringEquals) {
      for (const [key, expected] of Object.entries(condition.StringEquals)) {
        const actual = context.attributes?.[key];
        if (!actual) return false;
        const expectedValues = Array.isArray(expected) ? expected : [expected];
        if (!expectedValues.includes(actual)) return false;
      }
    }

    return true;
  }

  private matchesCidr(ip: string, cidr: string): boolean {
    if (!cidr.includes('/')) return ip === cidr;

    try {
      const [rangeStr, bitsStr] = cidr.split('/');
      if (!rangeStr || !bitsStr) return false;
      const bits = parseInt(bitsStr, 10);
      if (isNaN(bits) || bits < 0 || bits > 32) return false;
      const ipNum = this.ipToNumber(ip);
      const rangeNum = this.ipToNumber(rangeStr);
      if (ipNum === null || rangeNum === null) return false;
      const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
      return (ipNum & mask) === (rangeNum & mask);
    } catch {
      return false;
    }
  }

  private ipToNumber(ip: string): number | null {
    const parts = ip.split('.');
    if (parts.length !== 4) return null;
    let num = 0;
    for (const part of parts) {
      const octet = parseInt(part, 10);
      if (isNaN(octet) || octet < 0 || octet > 255) return null;
      num = (num << 8) + octet;
    }
    return num >>> 0;
  }

  async collectPolicies(userId: string, tenantId: string): Promise<Policy[]> {
    const cacheKey = `policies:${userId}`;
    const cached = await this.cacheService.get<Policy[]>(tenantId, cacheKey);
    if (cached) return cached;

    const policies: Policy[] = [];
    const seenIds = new Set<string>();

    const addPolicy = (policy: Policy) => {
      if (!seenIds.has(policy.id)) {
        seenIds.add(policy.id);
        policies.push(policy);
      }
    };

    // 1. Inline user policies
    const userPolicies = await this.userPolicyRepo.find({
      where: { userId, tenantId },
      relations: ['policy'],
    });
    for (const up of userPolicies) {
      if (up.policy) addPolicy(up.policy);
    }

    // 2. Role policies (via user's roles) — batched to avoid N+1
    const userRoles = await this.userRoleRepo.find({
      where: { userId, tenantId },
    });
    const activeRoleIds = userRoles
      .filter(ur => !ur.expiresAt || ur.expiresAt >= new Date())
      .map(ur => ur.roleId);
    if (activeRoleIds.length > 0) {
      const rolePolicies = await this.rolePolicyRepo.find({
        where: { roleId: In(activeRoleIds), tenantId },
        relations: ['policy'],
      });
      for (const rp of rolePolicies) {
        if (rp.policy) addPolicy(rp.policy);
      }
    }

    // 3. Group policies (via user's groups + parent groups)
    const userGroups = await this.userGroupRepo.find({
      where: { userId, tenantId },
      relations: ['group'],
    });
    const visitedGroups = new Set<string>();
    for (const ug of userGroups) {
      await this.collectGroupPolicies(ug.groupId, tenantId, addPolicy);
      visitedGroups.add(ug.groupId);
      if (ug.group?.parentGroupId) {
        await this.walkParentGroups(ug.group.parentGroupId, tenantId, addPolicy, visitedGroups);
      }
    }

    await this.cacheService.set(tenantId, cacheKey, policies, 300);
    return policies;
  }

  private async collectGroupPolicies(
    groupId: string,
    tenantId: string,
    addPolicy: (p: Policy) => void,
  ): Promise<void> {
    const groupPolicies = await this.groupPolicyRepo.find({
      where: { groupId, tenantId },
      relations: ['policy'],
    });
    for (const gp of groupPolicies) {
      if (gp.policy) addPolicy(gp.policy);
    }
  }

  private async walkParentGroups(
    groupId: string,
    tenantId: string,
    addPolicy: (p: Policy) => void,
    visited: Set<string>,
  ): Promise<void> {
    if (visited.has(groupId)) return;
    visited.add(groupId);

    const group = await this.groupRepo.findOne({ where: { id: groupId, tenantId } });
    if (!group) return;

    await this.collectGroupPolicies(groupId, tenantId, addPolicy);

    if (group.parentGroupId) {
      await this.walkParentGroups(group.parentGroupId, tenantId, addPolicy, visited);
    }
  }

  private async checkPermissionBoundary(
    userId: string,
    tenantId: string,
    action: string,
    resource: string,
    context: EvaluationContext,
  ): Promise<EvaluationResult | null> {
    const userRoles = await this.userRoleRepo.find({
      where: { userId, tenantId },
      relations: ['role'],
    });

    for (const ur of userRoles) {
      if (ur.expiresAt && ur.expiresAt < new Date()) continue;

      const role = ur.role;
      if (!role?.permissionBoundaryPolicyId) continue;

      const boundaryPolicy = await this.policyRepo.findOne({
        where: { id: role.permissionBoundaryPolicyId },
      });
      if (!boundaryPolicy) continue;

      let boundaryAllows = false;
      for (const statement of boundaryPolicy.document.Statement) {
        if (statement.Effect !== 'Allow') continue;
        if (!this.matchesAction(statement.Action, action)) continue;
        if (!this.matchesResource(statement.Resource, resource)) continue;
        if (!this.evaluateConditions(statement.Condition, context)) continue;
        boundaryAllows = true;
        break;
      }

      if (!boundaryAllows) {
        return {
          allowed: false,
          reason: 'boundary_deny',
          deniedBy: [`boundary:${boundaryPolicy.name}`],
        };
      }
    }

    return null;
  }
}
