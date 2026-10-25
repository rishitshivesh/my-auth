import { Injectable, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, VerifyCallback, Profile } from "passport-google-oauth20";
import { ConfigService } from "@nestjs/config";
import { SocialProfile } from "../social-auth.service";

/**
 * GoogleStrategy
 *
 * Passport strategy for Google OAuth 2.0
 *
 * Scopes:
 * - openid: Required for OIDC
 * - email: Get user's email
 * - profile: Get user's profile (name, picture)
 */
/**
 * A provider that is not configured is simply not offered (login routes answer SOCIAL_PROVIDER_DISABLED);
 * the strategy must still construct so the app boots without social credentials.
 */
const UNCONFIGURED = "provider-not-configured";

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, "google") {
  private readonly logger = new Logger(GoogleStrategy.name);

  constructor(private configService: ConfigService) {
    super({
      clientID: (configService.get<string>("INTERNAL_GOOGLE_CLIENT_ID") || UNCONFIGURED),
      clientSecret: (configService.get<string>("INTERNAL_GOOGLE_CLIENT_SECRET") || UNCONFIGURED),
      callbackURL: (configService.get<string>("INTERNAL_GOOGLE_CALLBACK_URL") || UNCONFIGURED),
      scope: ["openid", "email", "profile"],
      passReqToCallback: true,
      state: false, // We manage state ourselves (base64url JSON)
    });

    this.logger.log("GoogleStrategy initialized");
  }

  /**
   * Validate callback
   *
   * Called after user approves OAuth at Google
   *
   * @param req Express request
   * @param accessToken Google access token
   * @param refreshToken Google refresh token (might be undefined)
   * @param profile User profile from Google
   * @param done Callback
   */
  async validate(
    req: any,
    accessToken: string,
    refreshToken: string | undefined,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      this.logger.debug("Google OAuth callback received", {
        profileId: profile.id,
        email: profile.emails?.[0]?.value,
      });

      // Extract data from Google profile
      const email = profile.emails?.[0]?.value;
      const emailVerified = profile.emails?.[0]?.verified ?? false;

      if (!email) {
        return done(new Error("Email not provided by Google"), undefined);
      }

      // Map to SocialProfile
      const socialProfile: SocialProfile = {
        provider: "google",
        providerId: profile.id,
        email,
        emailVerified,
        displayName: profile.displayName,
        firstName: profile.name?.givenName,
        lastName: profile.name?.familyName,
        avatarUrl: profile.photos?.[0]?.value,
        accessToken,
        refreshToken,
        scopes: "openid email profile",
        raw: profile._json,
      };

      // Attach to request for controller
      done(null, socialProfile);
    } catch (error: any) {
      this.logger.error("Google validation error", {
        error: error.message,
        stack: error.stack,
      });
      done(error, undefined);
    }
  }
}
