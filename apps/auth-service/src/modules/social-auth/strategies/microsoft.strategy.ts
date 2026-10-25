import { Injectable, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy } from "passport-microsoft";
import { ConfigService } from "@nestjs/config";
import { SocialProfile } from "../social-auth.service";

/**
 * MicrosoftStrategy
 *
 * Passport strategy for Microsoft OAuth 2.0 / Azure AD
 *
 * Scopes:
 * - openid: OIDC
 * - email: Get user's email
 * - profile: Get user's profile
 */
/**
 * A provider that is not configured is simply not offered (login routes answer SOCIAL_PROVIDER_DISABLED);
 * the strategy must still construct so the app boots without social credentials.
 */
const UNCONFIGURED = "provider-not-configured";

@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, "microsoft") {
  private readonly logger = new Logger(MicrosoftStrategy.name);

  constructor(private configService: ConfigService) {
    super({
      clientID: (configService.get<string>("INTERNAL_MICROSOFT_CLIENT_ID") || UNCONFIGURED),
      clientSecret: (configService.get<string>("INTERNAL_MICROSOFT_CLIENT_SECRET") || UNCONFIGURED),
      callbackURL: (configService.get<string>("INTERNAL_MICROSOFT_CALLBACK_URL") || UNCONFIGURED),
      scope: ["openid", "email", "profile"],
      tenant: "common", // Support personal + work accounts
      passReqToCallback: true,
      state: false, // We manage state ourselves (base64url JSON)
    });

    this.logger.log("MicrosoftStrategy initialized");
  }

  /**
   * Entra/MSA email claims are mutable and not verified by default (nOAuth), so
   * only trust an explicit verification claim from the provider.
   */
  private static isEmailVerified(claims: unknown): boolean {
    if (typeof claims !== "object" || claims === null) return false;
    const { verified_email: verifiedEmail, xms_edov: edov } = claims as Record<string, unknown>;
    return [verifiedEmail, edov].some((v) => v === true || v === 1 || v === "1" || v === "true");
  }

  async validate(
    req: any,
    accessToken: string,
    refreshToken: string | undefined,
    profile: any,
    done: any,
  ): Promise<void> {
    try {
      this.logger.debug("Microsoft OAuth callback received", {
        profileId: profile.id,
        email: profile.emails?.[0]?.value,
      });

      const email = profile.emails?.[0]?.value;

      if (!email) {
        return done(new Error("Email not provided by Microsoft"), undefined);
      }

      // Map to SocialProfile
      const socialProfile: SocialProfile = {
        provider: "microsoft",
        providerId: profile.id,
        email,
        emailVerified: MicrosoftStrategy.isEmailVerified(profile._json),
        displayName: profile.displayName,
        firstName: profile.name?.givenName,
        lastName: profile.name?.familyName,
        avatarUrl: profile.photos?.[0]?.value,
        accessToken,
        refreshToken,
        scopes: "openid email profile",
        raw: profile._json,
      };

      done(null, socialProfile);
    } catch (error: any) {
      this.logger.error("Microsoft validation error", {
        error: error.message,
        stack: error.stack,
      });
      done(error, undefined);
    }
  }
}
