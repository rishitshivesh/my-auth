import { Injectable } from "@nestjs/common";
import { ApiException } from "@/common/http";
import { scimError } from "./scim-errors";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as crypto from "crypto";
import { ScimToken } from "@repo/database";

@Injectable()
export class ScimTokenService {
  constructor(
    @InjectRepository(ScimToken)
    private tokenRepo: Repository<ScimToken>,
  ) {}

  async createToken(tenantId: string, name: string, expiresInDays?: number): Promise<{ token: string; record: ScimToken }> {
    const rawToken = `scim_${crypto.randomBytes(32).toString("hex")}`;
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const expiresAt = expiresInDays
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : undefined;

    const record = this.tokenRepo.create({ tenantId, name, tokenHash, expiresAt, active: true });
    await this.tokenRepo.save(record);

    return { token: rawToken, record };
  }

  async listTokens(tenantId: string): Promise<ScimToken[]> {
    return this.tokenRepo.find({ where: { tenantId, active: true }, order: { createdAt: "DESC" } });
  }

  async revokeToken(tenantId: string, id: string): Promise<void> {
    const token = await this.tokenRepo.findOne({ where: { id, tenantId } });
    if (!token) throw new ApiException("RESOURCE_NOT_FOUND", { detail: "SCIM token not found" });
    await this.tokenRepo.softDelete(id);
  }

  async validateToken(rawToken: string): Promise<ScimToken> {
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const record = await this.tokenRepo.findOne({ where: { tokenHash: hash, active: true } });

    if (!record) throw scimError(401, "Invalid SCIM token");
    if (record.expiresAt && record.expiresAt < new Date()) {
      throw scimError(401, "SCIM token has expired");
    }

    await this.tokenRepo.update(record.id, { lastUsedAt: new Date() });
    return record;
  }
}
