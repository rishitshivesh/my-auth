import { Injectable, Logger } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { Strategy, Profile } from "passport-github2";
import { ConfigService } from "@nestjs/config";
import { SocialProfile } from "../social-auth.service";

/**
 * GitHubStrategy
 *
 * Passport strategy for GitHub OAuth
 *
 * Scopes:
 * - user:email: Get user's email addresses
 *
 * Note: GitHub doesn't use OIDC, just OAuth 2.0
 */
/**
 * A provider that is not configured is simply not offered (login routes answer SOCIAL_PROVIDER_DISABLED);
 * the strategy must still construct so the app boots without social credentials.
 */
const UNCONFIGURED = "provider-not-configured";

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, "github") {
  private readonly logger = new Logger(GitHubStrategy.name);

  constructor(private configService: ConfigService) {
    super({
      clientID: (configService.get<string>("INTERNAL_GITHUB_CLIENT_ID") || UNCONFIGURED),
      clientSecret: (configService.get<string>("INTERNAL_GITHUB_CLIENT_SECRET") || UNCONFIGURED),
      callbackURL: (configService.get<string>("INTERNAL_GITHUB_CALLBACK_URL") || UNCONFIGURED),
      scope: ["user:email"],
      passReqToCallback: true,
    });

    this.logger.log("GitHubStrategy initialized");
  }

  async validate(
    req: any,
    accessToken: string,
    refreshToken: string | undefined,
    profile: Profile,
    done: (error: any, user?: any) => void,
  ): Promise<void> {
    try {
      this.logger.debug("GitHub OAuth callback received", {
        profileId: profile.id,
        username: profile.username,
      });

      // GitHub can return multiple emails
      const primaryEmail: any =
        profile.emails?.find((e: any) => e.primary) || profile.emails?.[0];
      const email = primaryEmail?.value;

      if (!email) {
        return done(new Error("Email not provided by GitHub"), undefined);
      }

      // Map to SocialProfile
      const socialProfile: SocialProfile = {
        provider: "github",
        providerId: profile.id,
        email,
        emailVerified: primaryEmail?.verified ?? false,
        displayName: profile.displayName || profile.username,
        firstName: profile.name?.givenName,
        lastName: profile.name?.familyName,
        avatarUrl: profile.photos?.[0]?.value || (profile as any).avatar_url,
        accessToken,
        refreshToken,
        scopes: "user:email",
        raw: (profile as any)._json,
      };

      done(null, socialProfile);
    } catch (error: any) {
      this.logger.error("GitHub validation error", {
        error: error.message,
        stack: error.stack,
      });
      done(error, undefined);
    }
  }
}
