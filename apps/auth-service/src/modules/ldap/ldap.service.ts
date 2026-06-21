import {
  Injectable,
  NotFoundException,
  BadRequestException,
  InternalServerErrorException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import * as ldapjs from "ldapjs";
import * as crypto from "crypto";
import { LdapConnection, User } from "@repo/database";
import { CreateLdapConnectionDto, UpdateLdapConnectionDto } from "./ldap.dto";
import { logger } from "@/common/logger";

export interface LdapSyncResult {
  usersCreated: number;
  usersUpdated: number;
  errors: string[];
}

interface LdapEntry {
  email?: string;
  displayName?: string;
  firstName?: string;
  lastName?: string;
  dn: string;
}

@Injectable()
export class LdapService {
  constructor(
    @InjectRepository(LdapConnection)
    private connectionRepo: Repository<LdapConnection>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private config: ConfigService,
  ) {}

  private encryptPassword(plaintext: string): string {
    const key = Buffer.from(
      this.config.getOrThrow<string>("KEYRING_MASTER_KEY").padEnd(32, "0").slice(0, 32),
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted.toString("hex")}`;
  }

  private decryptPassword(ciphertext: string): string {
    const [ivHex, tagHex, encHex] = ciphertext.split(":");
    if (!ivHex || !tagHex || !encHex) throw new InternalServerErrorException("Invalid encrypted password format");
    const key = Buffer.from(
      this.config.getOrThrow<string>("KEYRING_MASTER_KEY").padEnd(32, "0").slice(0, 32),
    );
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  }

  async create(tenantId: string, dto: CreateLdapConnectionDto): Promise<LdapConnection> {
    const conn = this.connectionRepo.create({
      tenantId,
      name: dto.name,
      host: dto.host,
      port: dto.port ?? 389,
      bindDn: dto.bindDn,
      bindPasswordEncrypted: this.encryptPassword(dto.bindPassword),
      baseDn: dto.baseDn,
      userFilter: dto.userFilter ?? "(objectClass=inetOrgPerson)",
      groupFilter: dto.groupFilter ?? "(objectClass=groupOfNames)",
      emailAttribute: dto.emailAttribute ?? "mail",
      displayNameAttribute: dto.displayNameAttribute ?? "cn",
      firstNameAttribute: dto.firstNameAttribute ?? "givenName",
      lastNameAttribute: dto.lastNameAttribute ?? "sn",
      syncSchedule: dto.syncSchedule ?? "manual",
      useTls: dto.useTls ?? false,
      active: true,
    });
    return this.connectionRepo.save(conn);
  }

  async list(tenantId: string): Promise<LdapConnection[]> {
    return this.connectionRepo.find({ where: { tenantId }, order: { createdAt: "DESC" } });
  }

  async update(tenantId: string, id: string, dto: UpdateLdapConnectionDto): Promise<LdapConnection> {
    const conn = await this.findOne(tenantId, id);
    if (dto.bindPassword) {
      (conn as LdapConnection & { bindPasswordEncrypted: string }).bindPasswordEncrypted =
        this.encryptPassword(dto.bindPassword);
    }
    const { bindPassword: _, ...rest } = dto;
    Object.assign(conn, rest);
    return this.connectionRepo.save(conn);
  }

  async delete(tenantId: string, id: string): Promise<void> {
    const conn = await this.findOne(tenantId, id);
    await this.connectionRepo.softDelete(conn.id);
  }

  async findOne(tenantId: string, id: string): Promise<LdapConnection> {
    const conn = await this.connectionRepo.findOne({ where: { id, tenantId } });
    if (!conn) throw new NotFoundException("LDAP connection not found");
    return conn;
  }

  async testConnection(tenantId: string, id: string): Promise<{ success: boolean; message: string }> {
    const conn = await this.findOne(tenantId, id);
    const password = this.decryptPassword(conn.bindPasswordEncrypted);

    return new Promise((resolve) => {
      const client = ldapjs.createClient({
        url: `${conn.useTls ? "ldaps" : "ldap"}://${conn.host}:${conn.port}`,
        connectTimeout: 5000,
        timeout: 5000,
      });

      client.on("error", (err: Error) => {
        client.destroy();
        resolve({ success: false, message: err.message });
      });

      client.bind(conn.bindDn, password, (err) => {
        client.destroy();
        if (err) {
          resolve({ success: false, message: err.message });
        } else {
          resolve({ success: true, message: "Connection successful" });
        }
      });
    });
  }

  async syncNow(tenantId: string, id: string): Promise<LdapSyncResult> {
    const conn = await this.findOne(tenantId, id);
    if (!conn.active) throw new BadRequestException("LDAP connection is inactive");

    const password = this.decryptPassword(conn.bindPasswordEncrypted);
    const result: LdapSyncResult = { usersCreated: 0, usersUpdated: 0, errors: [] };

    let client: ldapjs.Client | null = null;

    try {
      client = await this.createLdapClient(conn, password);
      const entries = await this.searchUsers(client, conn);

      for (const entry of entries) {
        if (!entry.email) continue;

        try {
          const existing = await this.userRepo.findOne({
            where: { tenantId, email: entry.email },
          });

          if (existing) {
            existing.displayName = entry.displayName ?? existing.displayName;
            existing.firstName = entry.firstName ?? existing.firstName;
            existing.lastName = entry.lastName ?? existing.lastName;
            await this.userRepo.save(existing);
            result.usersUpdated++;
          } else {
            const user = this.userRepo.create({
              tenantId,
              email: entry.email,
              displayName: entry.displayName,
              firstName: entry.firstName,
              lastName: entry.lastName,
              emailVerified: true,
              isActive: true,
            });
            await this.userRepo.save(user);
            result.usersCreated++;
          }
        } catch (err: unknown) {
          result.errors.push(`Failed to sync ${entry.email}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      await this.connectionRepo.update(id, {
        lastSyncAt: new Date(),
        lastSyncStatus: "success",
        lastSyncUsersCreated: result.usersCreated,
        lastSyncUsersUpdated: result.usersUpdated,
      });

      logger.info({ connectionId: id, tenantId, ...result }, "LDAP sync completed");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      await this.connectionRepo.update(id, {
        lastSyncAt: new Date(),
        lastSyncStatus: "failed",
      });
      throw new InternalServerErrorException(`LDAP sync failed: ${message}`);
    } finally {
      client?.destroy();
    }

    return result;
  }

  private createLdapClient(conn: LdapConnection, password: string): Promise<ldapjs.Client> {
    return new Promise((resolve, reject) => {
      const client = ldapjs.createClient({
        url: `${conn.useTls ? "ldaps" : "ldap"}://${conn.host}:${conn.port}`,
        connectTimeout: 10_000,
        timeout: 30_000,
      });

      client.on("error", (err: Error) => {
        client.destroy();
        reject(err);
      });

      client.bind(conn.bindDn, password, (err) => {
        if (err) {
          client.destroy();
          reject(err);
        } else {
          resolve(client);
        }
      });
    });
  }

  private searchUsers(client: ldapjs.Client, conn: LdapConnection): Promise<LdapEntry[]> {
    return new Promise((resolve, reject) => {
      const entries: LdapEntry[] = [];

      client.search(
        conn.baseDn,
        {
          filter: conn.userFilter,
          scope: "sub",
          attributes: [
            conn.emailAttribute,
            conn.displayNameAttribute,
            conn.firstNameAttribute,
            conn.lastNameAttribute,
          ],
        },
        (err, res) => {
          if (err) return reject(err);

          res.on("searchEntry", (entry) => {
            const attrs = entry.attributes.reduce<Record<string, string>>((acc, attr) => {
              acc[attr.type] = attr.values[0] ?? "";
              return acc;
            }, {});

            entries.push({
              dn: entry.objectName ?? "",
              email: attrs[conn.emailAttribute],
              displayName: attrs[conn.displayNameAttribute],
              firstName: attrs[conn.firstNameAttribute],
              lastName: attrs[conn.lastNameAttribute],
            });
          });

          res.on("error", reject);
          res.on("end", () => resolve(entries));
        },
      );
    });
  }
}
