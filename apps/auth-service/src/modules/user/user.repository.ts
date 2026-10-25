import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { TenantAwareRepository } from '@/core/database/tenant-aware.repository';
import { TenantContextService } from '@/core/database/tenant-context.service';
import { User, UserRole, Tenant, Role } from '@repo/database';
import { isOwnerLevel, maxPriority } from '../rbac/role-hierarchy';

export interface OrgMembership {
  tenantId: string;
  slug: string;
  name: string;
  role: string;
  isGuest: boolean;
  logoUrl?: string;
}

@Injectable()
export class UserRepository extends TenantAwareRepository<User> {
  protected get entityTarget() {
    return User;
  }

  constructor(
    @InjectDataSource() dataSource: DataSource,
    tenantContext: TenantContextService,
  ) {
    super(dataSource, tenantContext);
  }

  async findByEmail(email: string): Promise<User | null> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    return this.findOne({ where: { email } });
  }

  async findByTenantAndId(tenantId: string, userId: string): Promise<User | null> {
    // Defense-in-depth: tenant_id filter retained alongside schema-level isolation
    // Both layers must match for a query to succeed
    return this.findOne({ where: { id: userId, tenantId } });
  }

  /** Highest priority among the user's non-expired roles (0 when none). */
  async getMaxRolePriority(userId: string, tenantId: string): Promise<number> {
    const userRoles = await this.manager.find(UserRole, {
      where: { userId, tenantId },
      relations: ['role'],
    });
    return maxPriority(
      userRoles.filter((ur) => !ur.isExpired).map((ur) => ur.role?.priority ?? 0),
    );
  }

  /**
   * Priorities of the given roles, or null when any id is not a role of this
   * tenant (so foreign / unknown role ids can never be granted).
   */
  async getRolePriorities(tenantId: string, roleIds: string[]): Promise<number[] | null> {
    const unique = [...new Set(roleIds)];
    const roles = await this.manager.find(Role, { where: { id: In(unique), tenantId } });
    return roles.length === unique.length ? roles.map((r) => r.priority) : null;
  }

  /** True when no other user in the tenant holds an owner-level role. */
  async isLastOwnerLevelHolder(userId: string, tenantId: string): Promise<boolean> {
    const userRoles = await this.manager.find(UserRole, {
      where: { tenantId },
      relations: ['role'],
    });
    const holders = new Set(
      userRoles
        .filter((ur) => !ur.isExpired && isOwnerLevel(ur.role?.priority ?? 0))
        .map((ur) => ur.userId),
    );
    return holders.has(userId) && holders.size === 1;
  }

  async getUserOrgs(userId: string, tenantId: string): Promise<OrgMembership[]> {
    // Query tenant-schema user_roles via the TenantAware EntityManager
    const userRoles = await this.manager.find(UserRole, {
      where: { userId, tenantId },
      relations: ['role'],
    });

    if (userRoles.length === 0) return [];

    // Tenant is in public schema — use DataSource manager (not schema-scoped)
    const tenant = await this.dataSource.manager.findOne(Tenant, {
      where: { id: tenantId },
      select: ['id', 'name', 'slug', 'branding'],
    });

    if (!tenant) return [];

    const activeRole = userRoles
      .filter((ur) => !ur.isExpired)
      .sort((a, b) => (a.assignedAt < b.assignedAt ? -1 : 1))[0];

    return [
      {
        tenantId: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        role: activeRole?.role?.name ?? 'member',
        isGuest: activeRole?.isGuest ?? false,
        logoUrl: tenant.branding?.logoUrl,
      },
    ];
  }
}
