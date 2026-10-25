import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { SecurityEvent } from '@repo/database';
import { AuditFiltersDto } from './dto/audit-filters.dto';
import { ApiException } from '../../common/http';
import { toCsvCell } from '../../common/security/csv-sanitize';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface AuditCursor {
  createdAt: Date;
  id: string;
}

function encodeCursor(event: { createdAt: Date; id: string }): string {
  return Buffer.from(`${event.createdAt.toISOString()}|${event.id}`).toString('base64');
}

/** Decode `<iso>|<id>`; anything else is a client error, never a DB error. */
function decodeCursor(cursor: string): AuditCursor {
  const decoded = Buffer.from(cursor, 'base64').toString();
  const sep = decoded.lastIndexOf('|');
  const createdAt = new Date(decoded.slice(0, sep));
  const id = decoded.slice(sep + 1);
  if (sep < 1 || Number.isNaN(createdAt.getTime()) || !UUID_PATTERN.test(id)) {
    throw new ApiException('VALIDATION_FAILED', { detail: 'Invalid cursor' });
  }
  return { createdAt, id };
}

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

    // Decode before any query so a bad cursor fails fast as a 422.
    const cursor = filters.cursor ? decodeCursor(filters.cursor) : null;

    const total = await qb.getCount();

    if (cursor) {
      // Keyset on (createdAt, id) matching the ORDER BY so same-timestamp events are not skipped.
      qb.andWhere(
        '(event.createdAt < :cursorDate OR (event.createdAt = :cursorDate AND event.id < :cursorId))',
        { cursorDate: cursor.createdAt, cursorId: cursor.id },
      );
    }

    const items = await qb
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .take(limit + 1)
      .getMany();

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    const lastItem = page[page.length - 1];
    const nextCursor = hasMore && lastItem ? encodeCursor(lastItem) : null;

    return { items: page, nextCursor, total };
  }

  async exportCsv(tenantId: string, filters: AuditFiltersDto): Promise<string> {
    const items = await this.buildQuery(tenantId, filters)
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .take(10000)
      .getMany();

    const header =
      'timestamp,eventType,severity,actorEmail,userId,ipAddress,resourceType,resourceId,outcome,requestId\n';
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
        e.outcome ?? '',
        e.requestId ?? '',
      ]
        .map(toCsvCell)
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
    if (filters.requestId) {
      qb.andWhere('event.requestId = :requestId', { requestId: filters.requestId });
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
