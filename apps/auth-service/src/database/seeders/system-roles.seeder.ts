/**
 * Idempotent seeder for system roles + IAM policies.
 * Safe to run multiple times against existing tenants.
 *
 * Usage: ts-node -r tsconfig-paths/register -e "
 *   require('./src/database/seeders/system-roles.seeder').seedSystemRoles()
 * "
 */
import { DataSource } from 'typeorm';
import { Role, Policy, RolePolicy, Tenant } from '@repo/database';
import { SystemRoles } from '@/modules/rbac/constants/system-roles';
import { logger } from '@/common/logger';

export async function seedSystemRoles(dataSource: DataSource): Promise<void> {
  const tenantRepo = dataSource.getRepository(Tenant);
  const roleRepo = dataSource.getRepository(Role);
  const policyRepo = dataSource.getRepository(Policy);
  const rolePolicyRepo = dataSource.getRepository(RolePolicy);

  const tenants = await tenantRepo.find();
  logger.info({ count: tenants.length }, 'Seeding system roles for tenants');

  const systemRoleDefinitions = Object.values(SystemRoles);

  for (const tenant of tenants) {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET search_path TO "fk_${tenant.slug}", public`);

      for (const def of systemRoleDefinitions) {
        // Upsert role
        let role = await roleRepo.findOne({
          where: { tenantId: tenant.id, name: def.slug },
        });

        if (!role) {
          role = await roleRepo.save(
            roleRepo.create({
              tenantId: tenant.id,
              name: def.slug,
              displayName: def.name,
              description: def.description,
              isSystem: def.isSystem,
              priority: def.priority,
              scope: 'tenant',
            } as Partial<Role>),
          );
          logger.info({ tenantId: tenant.id, role: def.slug }, 'Created system role');
        }

        // Check if policy already attached
        const existingRolePolicy = await rolePolicyRepo.findOne({
          where: { tenantId: tenant.id, roleId: role.id },
          relations: ['policy'],
        });

        if (existingRolePolicy) {
          // Update existing policy document to match current definition
          await policyRepo.update(existingRolePolicy.policyId, {
            document: def.policy,
          });
          logger.info({ tenantId: tenant.id, role: def.slug }, 'Updated existing system policy');
          continue;
        }

        // Create new policy and attach
        const policy = await policyRepo.save(
          policyRepo.create({
            tenantId: tenant.id,
            name: `${def.name} Policy`,
            description: `System policy for ${def.name} role`,
            document: def.policy,
            isSystem: true,
            type: 'managed',
          } as Partial<Policy>),
        );

        await rolePolicyRepo.save(
          rolePolicyRepo.create({
            tenantId: tenant.id,
            roleId: role.id,
            policyId: policy.id,
          } as Partial<RolePolicy>),
        );

        logger.info({ tenantId: tenant.id, role: def.slug }, 'Created and attached system policy');
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      await queryRunner.rollbackTransaction();
      logger.error({ tenantId: tenant.id, err }, 'Failed to seed system roles for tenant');
    } finally {
      await queryRunner.query(`SET search_path TO public`);
      await queryRunner.release();
    }
  }

  logger.info('System roles seeding complete');
}
