import { Injectable } from '@nestjs/common';
import { ApiException } from '../../../common/http';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group, UserGroup, GroupPolicy, Policy } from '@repo/database';
import { CreateGroupDto, UpdateGroupDto } from '../dto/group.dto';
import { RbacCacheService } from './rbac-cache.service';
import { logger } from '@/common/logger';

@Injectable()
export class GroupService {
  constructor(
    @InjectRepository(Group) private groupRepo: Repository<Group>,
    @InjectRepository(UserGroup) private userGroupRepo: Repository<UserGroup>,
    @InjectRepository(GroupPolicy) private groupPolicyRepo: Repository<GroupPolicy>,
    @InjectRepository(Policy) private policyRepo: Repository<Policy>,
    private cacheService: RbacCacheService,
  ) {}

  async createGroup(tenantId: string, dto: CreateGroupDto): Promise<Group> {
    const existing = await this.groupRepo.findOne({
      where: { tenantId, name: dto.name },
    });
    if (existing) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: `Group "${dto.name}" already exists` });
    }

    let path = '/';
    if (dto.parentGroupId) {
      const parent = await this.groupRepo.findOne({
        where: { id: dto.parentGroupId, tenantId },
      });
      if (!parent) {
        throw new ApiException("RESOURCE_NOT_FOUND");
      }
      path = `${parent.path}${dto.name}/`;
    } else {
      path = `/${dto.name}/`;
    }

    const group = this.groupRepo.create({
      tenantId,
      name: dto.name,
      description: dto.description ?? null,
      parentGroupId: dto.parentGroupId ?? null,
      path,
    });

    const saved = await this.groupRepo.save(group);
    logger.info({ groupId: saved.id, name: saved.name, path: saved.path }, 'Group created');
    return saved;
  }

  async listGroups(tenantId: string): Promise<Group[]> {
    return this.groupRepo.find({
      where: { tenantId },
      order: { path: 'ASC' },
    });
  }

  async getGroup(id: string, tenantId: string): Promise<Group> {
    const group = await this.groupRepo.findOne({ where: { id, tenantId } });
    if (!group) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }
    return group;
  }

  async getGroupDetail(id: string, tenantId: string): Promise<{
    group: Group;
    members: UserGroup[];
    policies: GroupPolicy[];
  }> {
    const group = await this.getGroup(id, tenantId);

    const members = await this.userGroupRepo.find({
      where: { groupId: id, tenantId },
    });

    const policies = await this.groupPolicyRepo.find({
      where: { groupId: id, tenantId },
      relations: ['policy'],
    });

    return { group, members, policies };
  }

  async updateGroup(id: string, tenantId: string, dto: UpdateGroupDto): Promise<Group> {
    const group = await this.getGroup(id, tenantId);

    if (group.isSystem) {
      throw new ApiException("BAD_REQUEST", { detail: 'Cannot modify system group' });
    }

    if (dto.description !== undefined) group.description = dto.description ?? null;

    if (dto.name !== undefined && dto.name !== group.name) {
      const sibling = await this.groupRepo.findOne({
        where: { tenantId, name: dto.name },
      });
      if (sibling && sibling.id !== id) {
        throw new ApiException("RESOURCE_CONFLICT", { detail: `Group "${dto.name}" already exists` });
      }

      const oldPath = group.path;
      const parentPath = oldPath.substring(0, oldPath.lastIndexOf(group.name + '/'));
      const newPath = `${parentPath}${dto.name}/`;
      group.name = dto.name;
      group.path = newPath;

      const saved = await this.groupRepo.save(group);

      // Cascade path change to all descendants
      const descendants = await this.groupRepo
        .createQueryBuilder('g')
        .where('g.tenantId = :tenantId', { tenantId })
        .andWhere('g.path LIKE :prefix', { prefix: `${oldPath}%` })
        .andWhere('g.id != :id', { id })
        .getMany();

      for (const desc of descendants) {
        desc.path = newPath + desc.path.substring(oldPath.length);
        await this.groupRepo.save(desc);
      }

      logger.info({ groupId: id, oldPath, newPath }, 'Group renamed with path cascade');
      return saved;
    }

    const saved = await this.groupRepo.save(group);
    logger.info({ groupId: id }, 'Group updated');
    return saved;
  }

  async deleteGroup(id: string, tenantId: string): Promise<void> {
    const group = await this.getGroup(id, tenantId);

    if (group.isSystem) {
      throw new ApiException("BAD_REQUEST", { detail: 'Cannot delete system group' });
    }

    const memberCount = await this.userGroupRepo.count({
      where: { groupId: id, tenantId },
    });
    if (memberCount > 0) {
      throw new ApiException("BAD_REQUEST", { detail: 'Cannot delete group with members. Remove all members first.' });
    }

    const childCount = await this.groupRepo.count({
      where: { parentGroupId: id, tenantId },
    });
    if (childCount > 0) {
      throw new ApiException("BAD_REQUEST", { detail: 'Cannot delete group with child groups. Remove children first.' });
    }

    await this.groupRepo.delete({ id: group.id });
    await this.cacheService.invalidateTenant(tenantId);
    logger.info({ groupId: id }, 'Group deleted');
  }

  async addMember(groupId: string, userId: string, tenantId: string, addedBy?: string): Promise<UserGroup> {
    await this.getGroup(groupId, tenantId);

    const existing = await this.userGroupRepo.findOne({
      where: { groupId, userId, tenantId },
    });
    if (existing) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: 'User already in group' });
    }

    const ug = await this.userGroupRepo.save({
      tenantId,
      groupId,
      userId,
      addedBy: addedBy ?? null,
    });

    await this.cacheService.invalidateUser(userId, tenantId);
    logger.info({ groupId, userId }, 'User added to group');
    return ug;
  }

  async removeMember(groupId: string, userId: string, tenantId: string): Promise<void> {
    const ug = await this.userGroupRepo.findOne({
      where: { groupId, userId, tenantId },
    });
    if (!ug) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    await this.userGroupRepo.delete({ id: ug.id });
    await this.cacheService.invalidateUser(userId, tenantId);
    logger.info({ groupId, userId }, 'User removed from group');
  }

  async attachPolicy(groupId: string, policyId: string, tenantId: string): Promise<void> {
    await this.getGroup(groupId, tenantId);

    const policy = await this.policyRepo.findOne({ where: { id: policyId, tenantId } });
    if (!policy) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    const existing = await this.groupPolicyRepo.findOne({
      where: { groupId, policyId, tenantId },
    });
    if (existing) {
      throw new ApiException("RESOURCE_CONFLICT", { detail: 'Policy already attached to group' });
    }

    await this.groupPolicyRepo.save({ tenantId, groupId, policyId });
    await this.cacheService.invalidateTenant(tenantId);
    logger.info({ groupId, policyId }, 'Policy attached to group');
  }

  async detachPolicy(groupId: string, policyId: string, tenantId: string): Promise<void> {
    const gp = await this.groupPolicyRepo.findOne({
      where: { groupId, policyId, tenantId },
    });
    if (!gp) {
      throw new ApiException("RESOURCE_NOT_FOUND");
    }

    await this.groupPolicyRepo.delete({ id: gp.id });
    await this.cacheService.invalidateTenant(tenantId);
    logger.info({ groupId, policyId }, 'Policy detached from group');
  }
}
