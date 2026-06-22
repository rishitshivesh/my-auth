import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { SecurityEvent } from '@repo/database';
import { AuditFiltersDto } from './dto/audit-filters.dto';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(SecurityEvent)
    private readonly eventRepository: Repository<SecurityEvent>,
  ) {}

  async list(
    tenantId: string,
    filters: AuditFiltersDto,
  ): Promise<{ items: SecurityEvent[]; nextCursor: string | null; total: number }> {
    const limit = filters.limit ?? 50;

    const qb = this.buildQuery(tenantId, filters);

    const total = await qb.getCount();

    if (filters.cursor) {
      qb.andWhere('event.createdAt < :cursor', {
        cursor: new Date(Buffer.from(filters.cursor, 'base64').toString()),
      });
    }

    const items = await qb
      .orderBy('event.createdAt', 'DESC')
      .take(limit + 1)
      .getMany();

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    const lastItem = page[page.length - 1];
    const nextCursor =
      hasMore && lastItem
        ? Buffer.from(lastItem.createdAt.toISOString()).toString('base64')
        : null;

    return { items: page, nextCursor, total };
  }

  async exportCsv(tenantId: string, filters: AuditFiltersDto): Promise<string> {
    const items = await this.buildQuery(tenantId, filters)
      .orderBy('event.createdAt', 'DESC')
      .take(10000)
      .getMany();

    const sanitizeCsvValue = (v: unknown): string => {
      const s = String(v ?? '');
      return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    };

    const header =
      'timestamp,eventType,severity,actorEmail,userId,ipAddress,resourceType,resourceId\n';
    const rows = items.map((e) =>
      [
        e.createdAt.toISOString(),
        e.eventType,
        e.severity,
        e.actorEmail ?? '',
        e.userId ?? '',
        e.ipAddress,
        e.resourceType ?? '',
        e.resourceId ?? '',
      ]
        .map((v) => `"${sanitizeCsvValue(v).replace(/"/g, '""')}"`)
        .join(','),
    );

    return header + rows.join('\n');
  }

  private buildQuery(
    tenantId: string,
    filters: AuditFiltersDto,
  ): SelectQueryBuilder<SecurityEvent> {
    const qb = this.eventRepository
      .createQueryBuilder('event')
      .where('event.tenantId = :tenantId', { tenantId });

    if (filters.userId) {
      qb.andWhere('event.userId = :userId', { userId: filters.userId });
    }
    if (filters.eventType) {
      qb.andWhere('event.eventType = :eventType', { eventType: filters.eventType });
    }
    if (filters.startDate) {
      qb.andWhere('event.createdAt >= :startDate', {
        startDate: new Date(filters.startDate),
      });
    }
    if (filters.endDate) {
      qb.andWhere('event.createdAt <= :endDate', {
        endDate: new Date(filters.endDate),
      });
    }

    return qb;
  }
}
