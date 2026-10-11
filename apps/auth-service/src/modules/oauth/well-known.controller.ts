import { Controller, Get, Header } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RawResponse } from "@/common/decorators/raw-response.decorator";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { JwksService } from "./services/jwks.service";
import { buildOpenIdConfiguration } from "./openid-configuration";
import { JWKSResponseDto, OpenIDConfigurationDto } from "./dto";

/**
 * Standard, tenant-independent discovery endpoints at the issuer root.
 *
 * `/.well-known/*` is excluded from tenant resolution (GlobalModule), so
 * external verifiers (API gateways, SDKs, relying parties) can fetch keys
 * without sending tenant headers. The tenant-scoped `/oauth/jwks` and
 * `/oauth/.well-known/openid-configuration` routes remain for compatibility.
 */
@ApiTags("Discovery")
@RawResponse()
@Controller(".well-known")
export class WellKnownController {
  constructor(
    private readonly jwksService: JwksService,
    private readonly configService: ConfigService,
  ) {}

  @Get("jwks.json")
  @Header("Cache-Control", "public, max-age=300")
  @ApiOperation({ summary: "JSON Web Key Set (platform signing keys)" })
  @ApiResponse({ status: 200, type: JWKSResponseDto })
  async jwks(): Promise<JWKSResponseDto> {
    const keys = await this.jwksService.getVerificationKeys();
    return { keys } as JWKSResponseDto;
  }

  @Get("openid-configuration")
  @Header("Cache-Control", "public, max-age=300")
  @ApiOperation({ summary: "OpenID Connect discovery document" })
  @ApiResponse({ status: 200, type: OpenIDConfigurationDto })
  openIdConfiguration(): OpenIDConfigurationDto {
    return buildOpenIdConfiguration(this.configService);
  }
}
