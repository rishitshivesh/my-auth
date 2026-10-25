import { Injectable } from '@nestjs/common';
import { ApiException } from '../../../common/http';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Policy, RolePolicy, UserPolicy, GroupPolicy } from '@repo/database';
import { CreatePolicyDto, UpdatePolicyDto } from '../dto/policy.dto';
import { RbacCacheService } from './rbac-cache.service';
import { logger } from '@/common/logger';

@Injectable()
export class PolicyService {
  constructor(
    @InjectRepository(Policy) private policyRepo: Repository<Policy>,
    @InjectRepository(RolePolicy) private rolePolicyRepo: Repository<RolePolicy>,
    @InjectRepository(UserPolicy) private userPolicyRepo: Repository<UserPolicy>,
    @InjectRepository(GroupPolicy) private groupPolicyRepo: Repository<GroupPolicy>,
    private cacheService: RbacCacheService,
  ) {}

  async createPolicy(tenantId: string, dto: CreatePolicyDto): Promise<Policy> {
    this.validateDocument(dto.document);

    const existing = await this.policyRepo.findOne({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: `Policy "${dto.name}" already exists` });
    }

    const policy = this.policyRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      document: dto.document,
      type: dto.type ?? 'managed',
    });

    const saved = await this.policyRepo.save(policy);
    logger.info({ policyId: saved.id, name: saved.name }, 'Policy created');
    return saved;
  }

  async listPolicies(tenantId: string, page = 1, limit = 50): Promise<{ data: Policy[]; total: number }> {
    const [data, total] = await this.policyRepo.findAndCount({
      where: { tenantId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { data, total };
  }

  async getPolicy(id: string, tenantId: string): Promise<Policy> {
    const policy = await this.policyRepo.findOne({ where: { id, tenantId } });
    if (!policy) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }
    return policy;
  }

  async updatePolicy(id: string, tenantId: string, dto: UpdatePolicyDto): Promise<Policy> {
    const policy = await this.getPolicy(id, tenantId);

    if (policy.isSystem) {
      throw new ApiException("BAD_REQUEST", { detail: 'Cannot modify system policy' });
    }

    if (dto.document) {
      this.validateDocument(dto.document);
      policy.document = dto.document;
    }

    if (dto.description !== undefined) {
      policy.description = dto.description ?? null;
    }

    const saved = await this.policyRepo.save(policy);
    await this.cacheService.invalidateTenant(tenantId);
    logger.info({ policyId: id }, 'Policy updated');
    return saved;
  }

  async deletePolicy(id: string, tenantId: string): Promise<void> {
    const policy = await this.getPolicy(id, tenantId);

    if (policy.isSystem) {
      throw new ApiException("BAD_REQUEST", { detail: 'Cannot delete system policy' });
    }

    await this.policyRepo.delete({ id: policy.id });
    await this.cacheService.invalidateTenant(tenantId);
    logger.info({ policyId: id }, 'Policy deleted');
  }

  async attachPolicyToRole(roleId: string, policyId: string, tenantId: string): Promise<void> {
    await this.getPolicy(policyId, tenantId);

    const existing = await this.rolePolicyRepo.findOne({
      where: { roleId, policyId, tenantId },
    });
    if (existing) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: 'Policy already attached to role' });
    }

    await this.rolePolicyRepo.save({ roleId, policyId, tenantId });
    await this.cacheService.invalidateTenant(tenantId);
    logger.info({ roleId, policyId }, 'Policy attached to role');
  }

  async detachPolicyFromRole(roleId: string, policyId: string, tenantId: string): Promise<void> {
    const rp = await this.rolePolicyRepo.findOne({
      where: { roleId, policyId, tenantId },
    });
    if (!rp) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    await this.rolePolicyRepo.delete({ id: rp.id });
    await this.cacheService.invalidateTenant(tenantId);
    logger.info({ roleId, policyId }, 'Policy detached from role');
  }

  async listPoliciesForRole(roleId: string, tenantId: string): Promise<Policy[]> {
    const results = await this.rolePolicyRepo.find({
      where: { roleId, tenantId },
      relations: ['policy'],
    });
    return results.map(rp => rp.policy).filter((p): p is Policy => Boolean(p));
  }

  private validateDocument(doc: { Version: string; Statement: Array<{ Effect: string; Action: string | string[]; Resource: string | string[] }> }): void {
    if (!doc || typeof doc !== 'object' || !doc.Version || !doc.Statement || !Array.isArray(doc.Statement)) {
      throw new ApiException("BAD_REQUEST", { detail: 'Invalid policy document: Version and Statement[] required' });
    }

    if (doc.Statement.length === 0) {
      throw new ApiException("BAD_REQUEST", { detail: 'Policy document must have at least one statement' });
    }

    for (const stmt of doc.Statement) {
      if (!stmt || typeof stmt !== 'object' || Array.isArray(stmt)) {
        throw new ApiException("BAD_REQUEST", { detail: 'Each statement must be an object' });
      }
      if (!['Allow', 'Deny'].includes(stmt.Effect)) {
        throw new ApiException("BAD_REQUEST", { detail: `Invalid Effect: "${stmt.Effect}". Must be "Allow" or "Deny"` });
      }
      if (!stmt.Action || (Array.isArray(stmt.Action) && stmt.Action.length === 0)) {
        throw new ApiException("BAD_REQUEST", { detail: 'Statement must have at least one Action' });
      }
      if (!stmt.Resource || (Array.isArray(stmt.Resource) && stmt.Resource.length === 0)) {
        throw new ApiException("BAD_REQUEST", { detail: 'Statement must have at least one Resource' });
      }
    }
  }
}
