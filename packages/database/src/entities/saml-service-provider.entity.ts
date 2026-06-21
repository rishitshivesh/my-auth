import { Entity, Column, Index } from "typeorm";
import { BaseEntity } from "./base.entity";

@Entity("saml_service_providers")
@Index(["tenantId"])
@Index(["entityId", "tenantId"], { unique: true })
export class SamlServiceProvider extends BaseEntity {
  @Column({ type: "uuid", name: "tenant_id" })
  tenantId!: string;

  @Column({ type: "varchar", length: 255 })
  name!: string;

  @Column({ type: "text", name: "entity_id" })
  entityId!: string;

  @Column({ type: "text", name: "acs_url" })
  acsUrl!: string;

  @Column({ type: "text", name: "slo_url", nullable: true })
  sloUrl?: string;

  @Column({ type: "text", nullable: true })
  certificate?: string;

  @Column({
    type: "varchar",
    length: 128,
    name: "name_id_format",
    default: "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
  })
  nameIdFormat!: string;

  @Column({ type: "jsonb", name: "attribute_mapping", default: {} })
  attributeMapping!: Record<string, string>;

  @Column({ type: "boolean", default: true })
  active!: boolean;

  @Column({ type: "text", name: "metadata_url", nullable: true })
  metadataUrl?: string;

  @Column({ type: "boolean", name: "sign_assertions", default: true })
  signAssertions!: boolean;

  @Column({ type: "boolean", name: "encrypt_assertions", default: false })
  encryptAssertions!: boolean;
}
