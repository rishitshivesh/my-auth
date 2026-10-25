import { Injectable, Optional } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { ConfigService } from "@nestjs/config";
import * as ldapjs from "ldapjs";
import * as crypto from "crypto";
import { LdapConnection, SecurityEventType, User } from "@repo/database";
import { SessionService } from "@/common/service/session.service";
import { SecurityEventService } from "@/common/service/security-event.service";
import { CreateLdapConnectionDto, UpdateLdapConnectionDto } from "./ldap.dto";
import * as dns from "dns/promises";
import * as net from "net";
import { logger } from "@/common/logger";
import { isDialableAddress, parseCidrList } from "@/common/security/private-ip";

const SYNC_EMAIL_PATTERN = /^[^\s@<>"'\\]+@[^\s@<>"'\\]+\.[^\s@<>"'\\]+$/;

const DEFAULT_MAX_DEACTIVATE_PERCENT = 20;
const SYNC_AUDIT_IP = "0.0.0.0";
const SYNC_AUDIT_AGENT = "ldap-sync";

export interface LdapSyncResult {
  usersCreated: number;
  usersUpdated: number;
  usersDeactivated: number;
  usersReactivated: number;
  /** True when the safety valve stopped the sync before any change was made. */
  aborted: boolean;
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
    @Optional() private sessionService?: SessionService,
    @Optional() private securityEvents?: SecurityEventService,
  ) {}

  /**
   * SSRF guard: tenant-supplied hosts are resolved and every RESOLVED address is checked (never the
   * hostname), so a DNS name that rebinds to an internal address is refused. Private ranges are
   * dialable only inside LDAP_ALLOWED_PRIVATE_CIDRS; loopback/link-local/metadata never are.
   */
  private async assertHostDialable(host: string): Promise<void> {
    const addresses = net.isIP(host)
      ? [host]
      : (await dns.lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
    const allowed = parseCidrList(this.config.get<string>("LDAP_ALLOWED_PRIVATE_CIDRS", ""));
    if (addresses.some((address) => !isDialableAddress(address, allowed))) {
      throw new ApiException("VALIDATION_FAILED", {
        errors: [
          {
            field: "host",
            message:
              "LDAP host resolves to a private, loopback or link-local address that is not allowed for this deployment",
          },
        ],
      });
    }
  }

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
    if (!ivHex || !tagHex || !encHex) throw new ApiException("INTERNAL_ERROR");
    const key = Buffer.from(
      this.config.getOrThrow<string>("KEYRING_MASTER_KEY").padEnd(32, "0").slice(0, 32),
    );
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"), { authTagLength: 16 });
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    return Buffer.concat([decipher.update(Buffer.from(encHex, "hex")), decipher.final()]).toString("utf8");
  }

  async create(tenantId: string, dto: CreateLdapConnectionDto): Promise<LdapConnection> {
    await this.assertHostDialable(dto.host);
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
      // Directory credentials must not cross the wire in clear text unless explicitly opted out.
      useTls: dto.useTls ?? true,
      active: true,
    });
    return this.connectionRepo.save(conn);
  }

  async list(tenantId: string): Promise<LdapConnection[]> {
    return this.connectionRepo.find({ where: { tenantId }, order: { createdAt: "DESC" } });
  }

  async update(tenantId: string, id: string, dto: UpdateLdapConnectionDto): Promise<LdapConnection> {
    const conn = await this.findOne(tenantId, id);
    if (dto.host) await this.assertHostDialable(dto.host);
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
    if (!conn) throw new ApiException("RESOURCE_NOT_FOUND", { detail: "LDAP connection not found" });
    return conn;
  }

  async testConnection(tenantId: string, id: string): Promise<{ success: boolean; message: string }> {
    const conn = await this.findOne(tenantId, id);
    await this.assertHostDialable(conn.host);
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
    if (!conn.active) throw new ApiException("BAD_REQUEST", { detail: "LDAP connection is inactive" });
    await this.assertHostDialable(conn.host);

    const password = this.decryptPassword(conn.bindPasswordEncrypted);
    const result: LdapSyncResult = {
      usersCreated: 0,
      usersUpdated: 0,
      usersDeactivated: 0,
      usersReactivated: 0,
      aborted: false,
      errors: [],
    };

    let client: ldapjs.Client | null = null;

    try {
      client = await this.createLdapClient(conn, password);
      const entries = await this.searchUsers(client, conn);

      const directoryEmails = new Set(
        entries
          .map((e) => e.email)
          .filter((e): e is string => !!e && SYNC_EMAIL_PATTERN.test(e) && e.length <= 254)
          .map((e) => e.toLowerCase()),
      );
      const provisioned = await this.userRepo.find({
        where: { tenantId, ldapConnectionId: conn.id },
      });
      const toDeactivate = provisioned.filter(
        (u) => u.isActive && !directoryEmails.has(u.email.toLowerCase()),
      );

      // Safety valve first: a broken filter or an empty directory must not be able
      // to lock out most of a tenant. Nothing is changed when it trips.
      const activeCount = provisioned.filter((u) => u.isActive).length;
      const percent = activeCount === 0 ? 0 : (toDeactivate.length / activeCount) * 100;
      const maxPercent = this.config.get<number>(
        "LDAP_MAX_DEACTIVATE_PERCENT",
        DEFAULT_MAX_DEACTIVATE_PERCENT,
      );
      if (toDeactivate.length > 0 && percent > maxPercent) {
        return await this.abortSync(conn, tenantId, result, toDeactivate.length, activeCount, maxPercent);
      }

      for (const entry of entries) {
        if (!entry.email) continue;
        if (!SYNC_EMAIL_PATTERN.test(entry.email) || entry.email.length > 254) {
          result.errors.push(`Skipped ${entry.dn}: invalid email attribute`);
          continue;
        }

        try {
          const existing = await this.userRepo.findOne({
            where: { tenantId, email: entry.email },
          });

          if (existing) {
            if (this.isReactivation(existing, conn)) {
              await this.reactivate(existing, conn, tenantId);
              result.usersReactivated++;
            }
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
              ldapConnectionId: conn.id,
            });
            await this.userRepo.save(user);
            result.usersCreated++;
          }
        } catch (err: unknown) {
          result.errors.push(`Failed to sync ${entry.email}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }

      for (const user of toDeactivate) {
        try {
          await this.deactivate(user, conn, tenantId);
          result.usersDeactivated++;
        } catch (err: unknown) {
          result.errors.push(`Failed to deactivate ${user.email}: ${err instanceof Error ? err.message : String(err)}`);
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
      logger.error({ connectionId: id, tenantId, err: message }, "LDAP sync failed");
      throw new ApiException("INTERNAL_ERROR", { detail: "LDAP sync failed" });
    } finally {
      client?.destroy();
    }

    return result;
  }

  private isReactivation(user: User, conn: LdapConnection): boolean {
    return user.ldapConnectionId === conn.id && !user.isActive && !!user.ldapDeactivatedAt;
  }

  private async reactivate(user: User, conn: LdapConnection, tenantId: string): Promise<void> {
    user.isActive = true;
    user.ldapDeactivatedAt = null;
    this.audit(tenantId, user, conn, SecurityEventType.LDAP_USER_REACTIVATED, "info", "returned_to_directory");
  }

  /** Deactivate (never delete), end the user's sessions, and record why. */
  private async deactivate(user: User, conn: LdapConnection, tenantId: string): Promise<void> {
    user.isActive = false;
    user.ldapDeactivatedAt = new Date();
    await this.userRepo.save(user);
    await this.sessionService?.revokeOtherUserSessions(tenantId, user.id, undefined, "ldap_removed_from_directory");
    this.audit(tenantId, user, conn, SecurityEventType.LDAP_USER_DEACTIVATED, "warning", "removed_from_directory");
  }

  private audit(
    tenantId: string,
    user: User,
    conn: LdapConnection,
    eventType: SecurityEventType,
    severity: "info" | "warning" | "high",
    reason: string,
  ): void {
    this.securityEvents?.log({
      tenantId,
      userId: user.id,
      actorEmail: user.email,
      eventType,
      severity,
      ipAddress: SYNC_AUDIT_IP,
      userAgent: SYNC_AUDIT_AGENT,
      resourceId: conn.id,
      resourceType: "ldap_connection",
      metadata: { connectionId: conn.id, reason },
    });
  }

  private async abortSync(
    conn: LdapConnection,
    tenantId: string,
    result: LdapSyncResult,
    candidates: number,
    active: number,
    maxPercent: number,
  ): Promise<LdapSyncResult> {
    const message =
      `Sync aborted: ${candidates} of ${active} LDAP-provisioned users are missing from the directory, ` +
      `above the ${maxPercent}% limit (LDAP_MAX_DEACTIVATE_PERCENT). No users were changed.`;
    result.aborted = true;
    result.errors.push(message);
    await this.connectionRepo.update(conn.id, { lastSyncAt: new Date(), lastSyncStatus: "aborted" });
    this.securityEvents?.log({
      tenantId,
      eventType: SecurityEventType.LDAP_SYNC_ABORTED,
      severity: "high",
      ipAddress: SYNC_AUDIT_IP,
      userAgent: SYNC_AUDIT_AGENT,
      resourceId: conn.id,
      resourceType: "ldap_connection",
      metadata: { connectionId: conn.id, candidates, active, maxPercent },
    });
    logger.warn({ connectionId: conn.id, tenantId, candidates, active, maxPercent }, "LDAP sync aborted by safety valve");
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
              // LDAP attribute descriptions are case-insensitive; servers may return any casing.
              acc[attr.type.toLowerCase()] = attr.values[0] ?? "";
              return acc;
            }, {});

            entries.push({
              dn: entry.objectName ?? "",
              email: attrs[conn.emailAttribute.toLowerCase()],
              displayName: attrs[conn.displayNameAttribute.toLowerCase()],
              firstName: attrs[conn.firstNameAttribute.toLowerCase()],
              lastName: attrs[conn.lastNameAttribute.toLowerCase()],
            });
          });

          res.on("error", reject);
          res.on("end", () => resolve(entries));
        },
      );
    });
  }
}
