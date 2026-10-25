import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

/**
 * Minimal software WebAuthn authenticator (ES256, "none" attestation) so the real
 * @simplewebauthn/server verification runs end to end without a browser.
 */

type Cbor = number | Uint8Array | string | Map<Cbor, Cbor>;

function head(major: number, value: number): Buffer {
  if (value < 24) return Buffer.from([(major << 5) | value]);
  if (value < 256) return Buffer.from([(major << 5) | 24, value]);
  const b = Buffer.alloc(3);
  b[0] = (major << 5) | 25;
  b.writeUInt16BE(value, 1);
  return b;
}

function encode(v: Cbor): Buffer {
  if (typeof v === "number") return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === "string") {
    const s = Buffer.from(v, "utf8");
    return Buffer.concat([head(3, s.length), s]);
  }
  if (v instanceof Uint8Array) return Buffer.concat([head(2, v.length), Buffer.from(v)]);
  const parts: Buffer[] = [head(5, v.size)];
  for (const [k, val] of v) parts.push(encode(k), encode(val));
  return Buffer.concat(parts);
}

const b64u = (b: Buffer | Uint8Array): string => Buffer.from(b).toString("base64url");
const sha256 = (b: Buffer | string): Buffer => createHash("sha256").update(b).digest();

export interface AuthenticatorConfig {
  rpId: string;
  origin: string;
}

export class SoftAuthenticator {
  readonly credentialId = randomBytes(32);
  private readonly privateKey: KeyObject;
  private readonly x: Buffer;
  private readonly y: Buffer;
  counter: number;

  constructor(private readonly cfg: AuthenticatorConfig, startCounter = 0) {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.privateKey = privateKey;
    const jwk = publicKey.export({ format: "jwk" });
    this.x = Buffer.from(jwk.x as string, "base64url");
    this.y = Buffer.from(jwk.y as string, "base64url");
    this.counter = startCounter;
  }

  private authData(flags: number, withKey: boolean): Buffer {
    const counter = Buffer.alloc(4);
    counter.writeUInt32BE(this.counter);
    const base = Buffer.concat([sha256(this.cfg.rpId), Buffer.from([flags]), counter]);
    if (!withKey) return base;
    const cose = encode(
      new Map<Cbor, Cbor>([
        [1, 2],
        [3, -7],
        [-1, 1],
        [-2, this.x],
        [-3, this.y],
      ]),
    );
    const idLen = Buffer.alloc(2);
    idLen.writeUInt16BE(this.credentialId.length);
    return Buffer.concat([base, Buffer.alloc(16), idLen, this.credentialId, cose]);
  }

  /** Registration response for `options.challenge`. */
  register(challenge: string, origin = this.cfg.origin): Record<string, unknown> {
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.create", challenge, origin, crossOrigin: false }));
    const attestation = encode(
      new Map<Cbor, Cbor>([
        ["fmt", "none"],
        ["attStmt", new Map<Cbor, Cbor>()],
        ["authData", this.authData(0x45, true)],
      ]),
    );
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      type: "public-key",
      response: { attestationObject: b64u(attestation), clientDataJSON: b64u(clientData), transports: ["internal"] },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }

  /** Assertion response; the counter is whatever `this.counter` is when called (caller controls regression). */
  assert(challenge: string, origin = this.cfg.origin): Record<string, unknown> {
    const clientData = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin, crossOrigin: false }));
    const authData = this.authData(0x05, false);
    const signature = sign("sha256", Buffer.concat([authData, sha256(clientData)]), { key: this.privateKey, dsaEncoding: "der" });
    return {
      id: b64u(this.credentialId),
      rawId: b64u(this.credentialId),
      type: "public-key",
      response: { authenticatorData: b64u(authData), clientDataJSON: b64u(clientData), signature: b64u(signature) },
      clientExtensionResults: {},
    };
  }
}
