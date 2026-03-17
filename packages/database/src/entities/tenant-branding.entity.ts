import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
} from "typeorm";
import { BaseEntity } from "./base.entity";
import { Tenant } from "./tenant.entity";

export const FONT_FAMILY_ALLOWLIST = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Lato",
  "Poppins",
  "Montserrat",
  "Nunito",
  "Source Sans Pro",
  "Raleway",
  "Ubuntu",
  "system-ui",
] as const;

export type FontFamily = (typeof FONT_FAMILY_ALLOWLIST)[number];
export type HeaderWeight = "regular" | "bold";
export type BackgroundStyle = "solid" | "gradient";

@Entity("tenant_branding")
@Index(["tenantId"], { unique: true })
export class TenantBranding extends BaseEntity {
  @Column({ type: "uuid", name: "tenant_id", unique: true })
  tenantId!: string;

  @ManyToOne(() => Tenant, { onDelete: "CASCADE" })
  @JoinColumn({ name: "tenant_id" })
  tenant!: Tenant;

  @Column({
    type: "varchar",
    length: 7,
    name: "primary_color",
    default: "#6366f1",
  })
  primaryColor!: string;

  @Column({
    type: "varchar",
    length: 500,
    name: "logo_url",
    nullable: true,
  })
  logoUrl?: string;

  @Column({
    type: "varchar",
    length: 100,
    name: "font_family",
    default: "Inter",
  })
  fontFamily!: string;

  @Column({
    type: "varchar",
    length: 10,
    name: "header_weight",
    default: "bold",
  })
  headerWeight!: HeaderWeight;

  @Column({
    type: "varchar",
    length: 10,
    name: "background_style",
    default: "solid",
  })
  backgroundStyle!: BackgroundStyle;
}
