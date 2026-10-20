import { Injectable } from "@nestjs/common";
import { scimError } from "./scim-errors";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, FindOptionsWhere } from "typeorm";
import { User, Group, UserGroup } from "@repo/database";
import {
  ScimUser,
  ScimGroup,
  ScimListResponse,
  ScimPatchOp,
  SCIM_SCHEMA_USER,
  SCIM_SCHEMA_GROUP,
  SCIM_SCHEMA_LIST,
} from "./scim.types";
import { logger } from "@/common/logger";

@Injectable()
export class ScimService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Group) private groupRepo: Repository<Group>,
    @InjectRepository(UserGroup) private userGroupRepo: Repository<UserGroup>,
  ) {}

  // ── Users ─────────────────────────────────────────────────────────────────

  private userToScim(user: User, baseUrl: string): ScimUser {
    return {
      schemas: [SCIM_SCHEMA_USER],
      id: user.id,
      userName: user.email,
      name: {
        givenName: user.firstName ?? undefined,
        familyName: user.lastName ?? undefined,
        formatted: user.displayName ?? [user.firstName, user.lastName].filter(Boolean).join(" "),
      },
      emails: [{ value: user.email, primary: true, type: "work" }],
      displayName: user.displayName ?? user.email,
      active: user.isActive,
      meta: {
        resourceType: "User",
        created: user.createdAt.toISOString(),
        lastModified: user.updatedAt.toISOString(),
        location: `${baseUrl}/scim/v2/Users/${user.id}`,
      },
    };
  }

  async listUsers(
    tenantId: string,
    baseUrl: string,
    startIndex = 1,
    count = 100,
    filter?: string,
  ): Promise<ScimListResponse<ScimUser>> {
    const where: FindOptionsWhere<User> = { tenantId };
    if (filter) {
      const emailMatch = filter.match(/userName eq "([^"]+)"/i);
      if (emailMatch?.[1]) where.email = emailMatch[1];
    }

    const [users, total] = await this.userRepo.findAndCount({
      where,
      skip: startIndex - 1,
      take: count,
      order: { createdAt: "ASC" },
    });

    return {
      schemas: [SCIM_SCHEMA_LIST],
      totalResults: total,
      startIndex,
      itemsPerPage: count,
      Resources: users.map((u) => this.userToScim(u, baseUrl)),
    };
  }

  async getUser(tenantId: string, userId: string, baseUrl: string): Promise<ScimUser> {
    const user = await this.userRepo.findOne({ where: { id: userId, tenantId } });
    if (!user) throw scimError(404, "User not found");
    return this.userToScim(user, baseUrl);
  }

  async createUser(tenantId: string, scimUser: ScimUser, baseUrl: string): Promise<ScimUser> {
    const existing = await this.userRepo.findOne({ where: { tenantId, email: scimUser.userName } });
    if (existing) throw scimError(409, "User already exists", "uniqueness");

    const user = this.userRepo.create({
      tenantId,
      email: scimUser.userName,
      firstName: scimUser.name?.givenName,
      lastName: scimUser.name?.familyName,
      displayName: scimUser.displayName,
      isActive: scimUser.active ?? true,
      emailVerified: true,
    });

    await this.userRepo.save(user);
    return this.userToScim(user, baseUrl);
  }

  async replaceUser(tenantId: string, userId: string, scimUser: ScimUser, baseUrl: string): Promise<ScimUser> {
    const user = await this.userRepo.findOne({ where: { id: userId, tenantId } });
    if (!user) throw scimError(404, "User not found");

    user.firstName = scimUser.name?.givenName ?? user.firstName;
    user.lastName = scimUser.name?.familyName ?? user.lastName;
    user.displayName = scimUser.displayName ?? user.displayName;
    user.isActive = scimUser.active ?? user.isActive;

    await this.userRepo.save(user);
    return this.userToScim(user, baseUrl);
  }

  async patchUser(tenantId: string, userId: string, ops: ScimPatchOp[], baseUrl: string): Promise<ScimUser> {
    const user = await this.userRepo.findOne({ where: { id: userId, tenantId } });
    if (!user) throw scimError(404, "User not found");

    for (const op of ops) {
      this.applyUserPatch(user, op);
    }

    await this.userRepo.save(user);
    return this.userToScim(user, baseUrl);
  }

  private applyUserPatch(user: User, op: ScimPatchOp): void {
    if (op.op === "replace") {
      if (op.path === "active" || (typeof op.value === "object" && op.value !== null && "active" in (op.value as object))) {
        user.isActive = op.path === "active"
          ? Boolean(op.value)
          : Boolean((op.value as Record<string, unknown>).active);
      }
      if (op.path === "displayName") user.displayName = String(op.value ?? "");
    }
  }

  async deleteUser(tenantId: string, userId: string): Promise<void> {
    const user = await this.userRepo.findOne({ where: { id: userId, tenantId } });
    if (!user) throw scimError(404, "User not found");
    await this.userRepo.softDelete(userId);
  }

  // ── Groups ────────────────────────────────────────────────────────────────

  private async groupToScim(group: Group, baseUrl: string): Promise<ScimGroup> {
    const members = await this.userGroupRepo.find({ where: { groupId: group.id } });
    return {
      schemas: [SCIM_SCHEMA_GROUP],
      id: group.id,
      displayName: group.name,
      members: members.map((m) => ({ value: m.userId })),
      meta: {
        resourceType: "Group",
        created: group.createdAt.toISOString(),
        lastModified: group.createdAt.toISOString(),
        location: `${baseUrl}/scim/v2/Groups/${group.id}`,
      },
    };
  }

  async listGroups(
    tenantId: string,
    baseUrl: string,
    startIndex = 1,
    count = 100,
  ): Promise<ScimListResponse<ScimGroup>> {
    const [groups, total] = await this.groupRepo.findAndCount({
      where: { tenantId },
      skip: startIndex - 1,
      take: count,
    });

    const resources = await Promise.all(groups.map((g) => this.groupToScim(g, baseUrl)));
    return { schemas: [SCIM_SCHEMA_LIST], totalResults: total, startIndex, itemsPerPage: count, Resources: resources };
  }

  async getGroup(tenantId: string, groupId: string, baseUrl: string): Promise<ScimGroup> {
    const group = await this.groupRepo.findOne({ where: { id: groupId, tenantId } });
    if (!group) throw scimError(404, "Group not found");
    return this.groupToScim(group, baseUrl);
  }

  async createGroup(tenantId: string, scimGroup: ScimGroup, baseUrl: string): Promise<ScimGroup> {
    const group = this.groupRepo.create({ tenantId, name: scimGroup.displayName });
    await this.groupRepo.save(group);

    if (scimGroup.members?.length) {
      for (const member of scimGroup.members) {
        const ug = this.userGroupRepo.create({ groupId: group.id, userId: member.value, tenantId });
        await this.userGroupRepo.save(ug);
      }
    }

    return this.groupToScim(group, baseUrl);
  }

  async patchGroup(tenantId: string, groupId: string, ops: ScimPatchOp[], baseUrl: string): Promise<ScimGroup> {
    const group = await this.groupRepo.findOne({ where: { id: groupId, tenantId } });
    if (!group) throw scimError(404, "Group not found");

    for (const op of ops) {
      if (op.path === "displayName" && op.op === "replace") {
        group.name = String(op.value ?? group.name);
      }
      if (op.path === "members") {
        if (op.op === "add" && Array.isArray(op.value)) {
          for (const m of op.value as Array<{ value: string }>) {
            const existing = await this.userGroupRepo.findOne({ where: { groupId, userId: m.value } });
            if (!existing) {
              await this.userGroupRepo.save(this.userGroupRepo.create({ groupId, userId: m.value, tenantId }));
            }
          }
        } else if (op.op === "remove" && Array.isArray(op.value)) {
          for (const m of op.value as Array<{ value: string }>) {
            await this.userGroupRepo.delete({ groupId, userId: m.value });
          }
        } else if (op.op === "replace" && Array.isArray(op.value)) {
          await this.userGroupRepo.delete({ groupId });
          for (const m of op.value as Array<{ value: string }>) {
            await this.userGroupRepo.save(this.userGroupRepo.create({ groupId, userId: m.value, tenantId }));
          }
        }
      }
    }

    await this.groupRepo.save(group);
    return this.groupToScim(group, baseUrl);
  }

  async deleteGroup(tenantId: string, groupId: string): Promise<void> {
    const group = await this.groupRepo.findOne({ where: { id: groupId, tenantId } });
    if (!group) throw scimError(404, "Group not found");
    await this.userGroupRepo.delete({ groupId });
    await this.groupRepo.softDelete(groupId);
  }
}
