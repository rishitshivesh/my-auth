export function formatRelativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  }).format(new Date(isoString))
}

export function formatEventDescription(
  eventType: string,
  metadata?: Record<string, unknown>
): string {
  const descriptions: Record<string, string> = {
    'auth.login_success': 'Signed in successfully',
    'auth.login_failed': 'Sign-in attempt failed',
    'auth.logout': 'Signed out',
    'auth.token_refreshed': 'Session token refreshed',
    'auth.mfa_challenge_sent': 'MFA challenge sent',
    'user.registered': 'Account created',
    'user.updated': 'Profile updated',
    'user.locked': 'Account locked',
    'user.deleted': 'Account deleted',
    'password.changed': 'Password changed',
    'password.reset_requested': 'Password reset requested',
    'password.reset_completed': 'Password reset completed',
    'session.revoked': 'Session revoked',
    'session.all_revoked': 'All sessions revoked',
    'session.expired_cleanup': 'Expired sessions cleaned up',
    'passkey.registered': 'Passkey added',
    'passkey.removed': 'Passkey removed',
    'passkey.auth_success': 'Signed in with passkey',
    'passkey.auth_failed': 'Passkey authentication failed',
    'mfa.totp_enabled': 'Two-factor authentication enabled',
    'mfa.totp_disabled': 'Two-factor authentication disabled',
    'social.login_success': 'Signed in with social provider',
    'social.account_linked': 'Social account linked',
    'social.account_unlinked': 'Social account unlinked',
    'security.brute_force_threshold': 'Brute force threshold reached',
    'api_key.created': 'API key created',
    'api_key.revoked': 'API key revoked',
    'api_key.rotated': 'API key rotated',
    'branding.updated': 'Branding configuration updated',
  }

  if (descriptions[eventType]) return descriptions[eventType]

  // Fallback: convert 'some.event_type' → 'Some event type'
  return eventType
    .replace(/\./g, ' ')
    .replace(/_/g, ' ')
    .replace(/\b\w/, c => c.toUpperCase())
}

export function getEventColor(eventType: string): string {
  if (eventType.includes('failed') || eventType.includes('locked') ||
      eventType.includes('brute_force')) return 'text-destructive'
  if (eventType.includes('api_key') || eventType.includes('rotated'))
    return 'text-amber-500'
  if (eventType.includes('logout') || eventType.includes('revoked'))
    return 'text-muted-foreground'
  if (eventType.includes('passkey')) return 'text-purple-500'
  return 'text-primary'
}
