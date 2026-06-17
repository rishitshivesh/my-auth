import {
  DataSource,
  DeleteResult,
  EntityTarget,
  FindManyOptions,
  FindOneOptions,
  FindOptionsWhere,
  ObjectLiteral,
  SaveOptions,
  SelectQueryBuilder,
  UpdateResult,
} from 'typeorm';
import { TenantContextService } from './tenant-context.service';

type Criteria<T> = string | number | FindOptionsWhere<T>;

export abstract class TenantAwareRepository<T extends ObjectLiteral> {
  protected abstract get entityTarget(): EntityTarget<T>;

  constructor(
    protected readonly dataSource: DataSource,
    protected readonly tenantContext: TenantContextService,
  ) {}

  protected get manager() {
    const qr = this.tenantContext.getQueryRunner();
    return qr ? qr.manager : this.dataSource.manager;
  }

  findOne(options: FindOneOptions<T>): Promise<T | null> {
    return this.manager.findOne(this.entityTarget, options);
  }

  find(options?: FindManyOptions<T>): Promise<T[]> {
    return this.manager.find(this.entityTarget, options);
  }

  save(entity: T, options?: SaveOptions): Promise<T> {
    return this.manager.save(this.entityTarget, entity, options) as Promise<T>;
  }

  update(criteria: Criteria<T>, data: Partial<T>): Promise<UpdateResult> {
    return this.manager.update(this.entityTarget, criteria as FindOptionsWhere<T>, data);
  }

  softDelete(criteria: Criteria<T>): Promise<UpdateResult> {
    return this.manager.softDelete(this.entityTarget, criteria as FindOptionsWhere<T>);
  }

  delete(criteria: Criteria<T>): Promise<DeleteResult> {
    return this.manager.delete(this.entityTarget, criteria as FindOptionsWhere<T>);
  }

  count(options?: FindManyOptions<T>): Promise<number> {
    return this.manager.count(this.entityTarget, options);
  }

  createQueryBuilder(alias: string): SelectQueryBuilder<T> {
    return this.manager.createQueryBuilder(
      this.entityTarget,
      alias,
    ) as SelectQueryBuilder<T>;
  }
}
