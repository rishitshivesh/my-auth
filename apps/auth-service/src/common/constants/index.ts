export const AUTHORIZATION_KEY = 'x-authorization';

export const ALLOWED_URLS = ['*'];

export const EXPIRES_IN = {
  ONE_MINUTE: 60,
  FIVE_MINUTES: 300,
  ONE_HOUR: 3600,
  ONE_DAY: 86400,
  ONE_WEEK: 604800,
  ONE_MONTH: 2592000,
  ONE_YEAR: 31536000,
};

export const CRON_TIMES = {
  every10s: '*/10 * * * * *',
  everyMinute: '* * * * *',
  everyFiveMinutes: '*/5 * * * *',
  everyTenMinutes: '*/10 * * * *',
  everyFifteenMinutes: '*/15 * * * *',
  everyThirtyMinutes: '*/30 * * * *',
  hourly: '0 * * * *',
  everyThreeHours: '0 */3 * * *',
  everySixHours: '0 */6 * * *',
  everyTwelveHours: '0 */12 * * *',
  daily: '0 0 * * *',
  weekly: '0 0 * * 0',
  monthly: '0 0 1 * *',
  yearly: '0 0 1 1 *',
};

export enum AuditEventType {
  PROFILE_NAME_CHANGE = 'PROFILE_NAME_CHANGE',
  HANDLE_UPDATE = 'HANDLE_UPDATE',
  PROFILE_PICTURE_UPDATE = 'PROFILE_PICTURE_UPDATE',
  HEADER_IMAGE_UPDATE = 'HEADER_IMAGE_UPDATE',
  BIO_UPDATE = 'BIO_UPDATE',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  EMAIL_UPDATE = 'EMAIL_UPDATE',
  LOGIN_LOCATION = 'LOGIN_LOCATION',
  USER_REGISTER = 'USER_REGISTER',
  ADMIN_POST_STATUS_CHANGE = 'ADMIN_POST_STATUS_CHANGE',
  POST_DELETE = 'POST_DELETE',
  POST_ARCHIVE = 'POST_ARCHIVE',
  POST_UNARCHIVE = 'POST_UNARCHIVE',
  PHONE_CHANGE = 'PHONE_CHANGE',
  DEACTIVATE_ACCOUNT = 'DEACTIVATE_ACCOUNT',
  UPDATE_PROFILE = 'UPDATE_PROFILE',
}
