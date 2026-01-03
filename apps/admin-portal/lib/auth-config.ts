export interface AuthConfig {
  loginOptions: LoginOption[]
  socialProviders: SocialProvider[]
  mfa: MFAConfig
  passkeys: PasskeyConfig
  magicLink: MagicLinkConfig
  passwordPolicy: PasswordPolicy
  deviceTrust: DeviceTrustConfig
}

export interface LoginOption {
  id: string
  label: string
  type: "email-password" | "magic-link" | "passkey"
  enabled: boolean
}

export interface SocialProvider {
  id: string
  name: string
  enabled: boolean
}

export interface MFAConfig {
  enabled: boolean
  methods: MFAMethod[]
  maxAttempts: number
  lockoutDuration: number
  rememberDevice: {
    enabled: boolean
    duration: number
  }
}

export interface MFAMethod {
  id: string
  name: string
  type: "time-based-otp" | "email-otp" | "backup-codes" | "passkey"
  enabled: boolean
  description: string
  resendDelay?: number
}

export interface PasskeyConfig {
  enabled: boolean
  requireUserVerification: boolean
}

export interface MagicLinkConfig {
  enabled: boolean
  expirationTime: number
  resendDelay: number
}

export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  showRequirements: boolean
}

export interface DeviceTrustConfig {
  enabled: boolean
  requireLocationForTrust: boolean
  autoTrustDuration: number
}

// Load config from JSON
export async function loadAuthConfig(): Promise<AuthConfig> {
  const response = await fetch("/config/auth-config.json")
  return response.json()
}

// In-memory cache for config
const cachedConfig: AuthConfig = {
  "loginOptions": [
    {
      "id": "email-password",
      "label": "Email & Password",
      "type": "email-password",
      "enabled": true
    },
    {
      "id": "magic-link",
      "label": "Send me a magic link",
      "type": "magic-link",
      "enabled": true
    },
    {
      "id": "passkey",
      "label": "Login with Passkey",
      "type": "passkey",
      "enabled": true
    }
  ],
  "socialProviders": [
    {
      "id": "google",
      "name": "Google",
      "enabled": true
    },
    {
      "id": "github",
      "name": "GitHub",
      "enabled": true
    },
    {
      "id": "twitter",
      "name": "Twitter",
      "enabled": true
    }
  ],
  "mfa": {
    "enabled": true,
    "methods": [
      {
        "id": "totp",
        "name": "Authenticator App",
        "type": "time-based-otp",
        "enabled": true,
        "description": "Use an app like Google Authenticator"
      },
      {
        "id": "email-otp",
        "name": "Email Code",
        "type": "email-otp",
        "enabled": true,
        "description": "We'll send a code to your email",
        "resendDelay": 30
      },
      {
        "id": "backup-codes",
        "name": "Backup Codes",
        "type": "backup-codes",
        "enabled": true,
        "description": "One-time use recovery codes"
      },
      {
        "id": "passkey",
        "name": "Passkey",
        "type": "passkey",
        "enabled": true,
        "description": "Use your registered passkey"
      }
    ],
    "maxAttempts": 5,
    "lockoutDuration": 900,
    "rememberDevice": {
      "enabled": true,
      "duration": 2592000
    }
  },
  "passkeys": {
    "enabled": true,
    "requireUserVerification": true
  },
  "magicLink": {
    "enabled": true,
    "expirationTime": 900,
    "resendDelay": 30
  },
  "passwordPolicy": {
    "minLength": 8,
    "requireUppercase": true,
    "requireNumbers": true,
    "requireSpecialChars": true,
    "showRequirements": true
  },
  "deviceTrust": {
    "enabled": true,
    "requireLocationForTrust": false,
    "autoTrustDuration": 86400
  }
}


export async function getAuthConfig(): Promise<AuthConfig> {
  return cachedConfig
}
