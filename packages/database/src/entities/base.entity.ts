import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  BaseEntity as TypeORMBaseEntity,
} from "typeorm";

/**
 * Base Entity
 *
 * All entities extend this to get common fields:
 * - id (UUID primary key)
 * - createdAt (auto-generated timestamp)
 * - updatedAt (auto-updated timestamp)
 * - deletedAt (soft delete timestamp)
 */
export abstract class BaseEntity extends TypeORMBaseEntity {
  @PrimaryGeneratedColumn("uuid")
  id!: string;

  @CreateDateColumn({
    type: "timestamp with time zone",
    name: "created_at",
  })
  createdAt!: Date;

  @UpdateDateColumn({
    type: "timestamp with time zone",
    name: "updated_at",
  })
  updatedAt!: Date;

  @DeleteDateColumn({
    type: "timestamp with time zone",
    name: "deleted_at",
    nullable: true,
  })
  deletedAt?: Date;
}
