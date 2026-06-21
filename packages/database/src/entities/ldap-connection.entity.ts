import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

@Entity("ldap_connections")
@Index(["tenantId"])
export class LdapConnection extends BaseEntity {
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "varchar", length: 512 })
  host!: string;

  @Column({ type: "int", default: 389 })
  port!: number;

  @Column({ type: "varchar", length: 512, name: "bind_dn" })
  bindDn!: string;

  @Column({ type: "text", name: "bind_password_encrypted" })
  bindPasswordEncrypted!: string;

  @Column({ type: "varchar", length: 512, name: "base_dn" })
  baseDn!: string;

  @Column({
    type: "varchar",
    length: 512,
    name: "user_filter",
    default: "(objectClass=inetOrgPerson)",
  })
  userFilter!: string;

  @Column({
    type: "varchar",
    length: 512,
    name: "group_filter",
    default: "(objectClass=groupOfNames)",
  })
  groupFilter!: string;

  @Column({ type: "varchar", length: 128, name: "email_attribute", default: "mail" })
  emailAttribute!: string;

  @Column({ type: "varchar", length: 128, name: "display_name_attribute", default: "cn" })
  displayNameAttribute!: string;

  @Column({ type: "varchar", length: 128, name: "first_name_attribute", default: "givenName" })
  firstNameAttribute!: string;

  @Column({ type: "varchar", length: 128, name: "last_name_attribute", default: "sn" })
  lastNameAttribute!: string;

  @Column({ type: "varchar", length: 128, name: "sync_schedule", default: "manual" })
  syncSchedule!: string;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @Column({ type: "boolean", name: "use_tls", default: false })
  useTls!: boolean;

  @Column({ type: "timestamp with time zone", name: "last_sync_at", nullable: true })
  lastSyncAt?: Date;

  @Column({ type: "varchar", length: 64, name: "last_sync_status", nullable: true })
  lastSyncStatus?: string;

  @Column({ type: "int", name: "last_sync_users_created", nullable: true })
  lastSyncUsersCreated?: number;

  @Column({ type: "int", name: "last_sync_users_updated", nullable: true })
  lastSyncUsersUpdated?: number;
}
