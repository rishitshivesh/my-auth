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
@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, "microsoft") {
  private readonly logger = new Logger(MicrosoftStrategy.name);

  constructor(private configService: ConfigService) {
    super({
      clientID: configService.getOrThrow<string>(
        "INTERNAL_MICROSOFT_CLIENT_ID",
      ),
      clientSecret: configService.getOrThrow<string>(
        "INTERNAL_MICROSOFT_CLIENT_SECRET",
      ),
      callbackURL: configService.getOrThrow<string>(
        "INTERNAL_MICROSOFT_CALLBACK_URL",
      ),
      scope: ["openid", "email", "profile"],
      tenant: "common", // Support personal + work accounts
      passReqToCallback: true,
      state: false, // We manage state ourselves (base64url JSON)
    });

    this.logger.log("MicrosoftStrategy initialized");
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
        emailVerified: true, // Microsoft verifies emails
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
