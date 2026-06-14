import { Injectable } from '@nestjs/common';
import { RedisService } from '@/common/service/redis.service';
import { logger } from '@/common/logger';

const RBAC_RESOURCE = 'rbac';
const DEFAULT_TTL = 300; // 5 minutes

@Injectable()
export class RbacCacheService {
  constructor(private readonly redisService: RedisService) {}

  async get<T>(tenantId: string, key: string): Promise<T | null> {
    return this.redisService.get<T>(tenantId, RBAC_RESOURCE, key);
  }

  async set<T>(tenantId: string, key: string, value: T, ttl: number = DEFAULT_TTL): Promise<void> {
    await this.redisService.set(tenantId, RBAC_RESOURCE, key, value, ttl);
  }

  async invalidateUser(userId: string, tenantId: string): Promise<void> {
    await this.redisService.delete(tenantId, RBAC_RESOURCE, `policies:${userId}`);
    logger.info({ userId, tenantId }, 'Invalidated RBAC cache for user');
  }

  async invalidateTenant(tenantId: string): Promise<void> {
    await this.redisService.deletePattern(tenantId, `${RBAC_RESOURCE}:*`);
    logger.info({ tenantId }, 'Invalidated RBAC cache for tenant');
  }
}
