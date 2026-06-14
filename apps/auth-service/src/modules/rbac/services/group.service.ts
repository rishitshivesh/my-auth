import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
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
      throw new ConflictException(`Group "${dto.name}" already exists`);
    }

    let path = '/';
    if (dto.parentGroupId) {
      const parent = await this.groupRepo.findOne({
        where: { id: dto.parentGroupId, tenantId },
      });
      if (!parent) {
        throw new NotFoundException('Parent group not found');
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
      throw new NotFoundException('Group not found');
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
      throw new BadRequestException('Cannot modify system group');
    }

    if (dto.name !== undefined) group.name = dto.name;
    if (dto.description !== undefined) group.description = dto.description ?? null;

    const saved = await this.groupRepo.save(group);
    logger.info({ groupId: id }, 'Group updated');
    return saved;
  }

  async deleteGroup(id: string, tenantId: string): Promise<void> {
    const group = await this.getGroup(id, tenantId);

    if (group.isSystem) {
      throw new BadRequestException('Cannot delete system group');
    }

    const memberCount = await this.userGroupRepo.count({
      where: { groupId: id, tenantId },
    });
    if (memberCount > 0) {
      throw new BadRequestException('Cannot delete group with members. Remove all members first.');
    }

    const childCount = await this.groupRepo.count({
      where: { parentGroupId: id, tenantId },
    });
    if (childCount > 0) {
      throw new BadRequestException('Cannot delete group with child groups. Remove children first.');
    }

    await this.groupRepo.remove(group);
    await this.cacheService.invalidateTenant(tenantId);
    logger.info({ groupId: id }, 'Group deleted');
  }

  async addMember(groupId: string, userId: string, tenantId: string, addedBy?: string): Promise<UserGroup> {
    await this.getGroup(groupId, tenantId);

    const existing = await this.userGroupRepo.findOne({
      where: { groupId, userId, tenantId },
    });
    if (existing) {
      throw new ConflictException('User already in group');
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
      throw new NotFoundException('User not in group');
    }

    await this.userGroupRepo.remove(ug);
    await this.cacheService.invalidateUser(userId, tenantId);
    logger.info({ groupId, userId }, 'User removed from group');
  }

  async attachPolicy(groupId: string, policyId: string, tenantId: string): Promise<void> {
    await this.getGroup(groupId, tenantId);

    const policy = await this.policyRepo.findOne({ where: { id: policyId, tenantId } });
    if (!policy) {
      throw new NotFoundException('Policy not found');
    }

    const existing = await this.groupPolicyRepo.findOne({
      where: { groupId, policyId, tenantId },
    });
    if (existing) {
      throw new ConflictException('Policy already attached to group');
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
      throw new NotFoundException('Policy not attached to group');
    }

    await this.groupPolicyRepo.remove(gp);
    await this.cacheService.invalidateTenant(tenantId);
    logger.info({ groupId, policyId }, 'Policy detached from group');
  }
}
