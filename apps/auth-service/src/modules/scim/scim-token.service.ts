import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
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
    if (!token) throw new NotFoundException("SCIM token not found");
    await this.tokenRepo.softDelete(id);
  }

  async validateToken(rawToken: string): Promise<ScimToken> {
    const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
    const record = await this.tokenRepo.findOne({ where: { tokenHash: hash, active: true } });

    if (!record) throw new UnauthorizedException("Invalid SCIM token");
    if (record.expiresAt && record.expiresAt < new Date()) {
      throw new UnauthorizedException("SCIM token has expired");
    }

    await this.tokenRepo.update(record.id, { lastUsedAt: new Date() });
    return record;
  }
}
