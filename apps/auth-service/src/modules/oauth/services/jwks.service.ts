import { Injectable, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import * as crypto from "crypto";
import { logger } from "@/common/logger";

@Injectable()
export class JwksService implements OnModuleInit {
  private publicKeyJwk: crypto.JsonWebKey;
  private privateKey: crypto.KeyObject;
  private kid: string;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const pem = this.configService.get<string>("JWT_RSA_PRIVATE_KEY_PEM");

    if (pem) {
      this.privateKey = crypto.createPrivateKey(pem.replace(/\\n/g, "\n"));
      logger.info("JWKS: loaded RSA private key from environment");
    } else {
      const { privateKey } = crypto.generateKeyPairSync("rsa", {
        modulusLength: 2048,
        publicKeyEncoding: { type: "spki", format: "pem" },
        privateKeyEncoding: { type: "pkcs8", format: "pem" },
      });
      this.privateKey = crypto.createPrivateKey(privateKey);
      logger.warn(
        "JWKS: no JWT_RSA_PRIVATE_KEY_PEM set — generated ephemeral RSA key pair (not suitable for production)",
      );
    }

    const publicKey = crypto.createPublicKey(this.privateKey);
    this.publicKeyJwk = publicKey.export({ format: "jwk" });
    this.kid = this.computeKid(this.publicKeyJwk);
  }

  private computeKid(jwk: crypto.JsonWebKey): string {
    const thumbprintInput = JSON.stringify({
      e: jwk.e,
      kty: jwk.kty,
      n: jwk.n,
    });
    return crypto
      .createHash("sha256")
      .update(thumbprintInput)
      .digest("base64url")
      .slice(0, 16);
  }

  getJWKS() {
    return {
      keys: [
        {
          kty: "RSA",
          use: "sig",
          kid: this.kid,
          alg: "RS256",
          n: this.publicKeyJwk.n,
          e: this.publicKeyJwk.e,
        },
      ],
    };
  }

  getKid(): string {
    return this.kid;
  }

  getPrivateKey(): crypto.KeyObject {
    return this.privateKey;
  }
}
