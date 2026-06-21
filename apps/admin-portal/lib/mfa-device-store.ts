// Stores cosmetic device labels in localStorage. Backend holds one TOTP secret.

export interface TotpDevice {
  id: string;
  name: string;
  createdAt: string;
}

const TOTP_LABEL_KEY = (userId: string) => `sentry_totp_label_${userId}`;
const TOTP_DEVICES_KEY = (userId: string) => `sentry_totp_devices_${userId}`;

export function getTotpDeviceLabel(userId: string): string {
  if (typeof window === 'undefined') return 'Authenticator App';
  return localStorage.getItem(TOTP_LABEL_KEY(userId)) ?? 'Authenticator App';
}

export function setTotpDeviceLabel(userId: string, label: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TOTP_LABEL_KEY(userId), label);
}

export function clearTotpDeviceLabel(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOTP_LABEL_KEY(userId));
}

export function listTotpDevices(userId: string): TotpDevice[] {
  if (typeof window === 'undefined') return [];
  const stored = localStorage.getItem(TOTP_DEVICES_KEY(userId));
  if (!stored) return [];
  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

export function addTotpDevice(userId: string, name: string): TotpDevice {
  const devices = listTotpDevices(userId);
  const newDevice: TotpDevice = {
    id: `totp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    name: name || 'Authenticator App',
    createdAt: new Date().toISOString(),
  };
  devices.push(newDevice);
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOTP_DEVICES_KEY(userId), JSON.stringify(devices));
    localStorage.setItem(TOTP_LABEL_KEY(userId), name || 'Authenticator App'); // Sync main label with latest
  }
  return newDevice;
}

export function deleteTotpDevice(userId: string, deviceId: string): void {
  const devices = listTotpDevices(userId);
  const updated = devices.filter(d => d.id !== deviceId);
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOTP_DEVICES_KEY(userId), JSON.stringify(updated));
    if (updated.length > 0) {
      localStorage.setItem(TOTP_LABEL_KEY(userId), updated[updated.length - 1]!.name);
    } else {
      localStorage.removeItem(TOTP_LABEL_KEY(userId));
    }
  }
}

export function clearTotpDevices(userId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(TOTP_DEVICES_KEY(userId));
  localStorage.removeItem(TOTP_LABEL_KEY(userId));
}

export function renameTotpDevice(userId: string, deviceId: string, name: string): void {
  const devices = listTotpDevices(userId);
  const updated = devices.map(d => d.id === deviceId ? { ...d, name } : d);
  if (typeof window !== 'undefined') {
    localStorage.setItem(TOTP_DEVICES_KEY(userId), JSON.stringify(updated));
    // If the renamed device is the main/latest one, sync the main label
    if (updated.length > 0 && updated[updated.length - 1]!.id === deviceId) {
      localStorage.setItem(TOTP_LABEL_KEY(userId), name);
    }
  }
}

const PASSKEY_NAME_KEY = (credId: string) => `sentry_passkey_name_${credId}`;

export function getPasskeyName(credId: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem(PASSKEY_NAME_KEY(credId)) ?? fallback;
}

export function setPasskeyName(credId: string, name: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(PASSKEY_NAME_KEY(credId), name);
}

export function clearPasskeyName(credId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(PASSKEY_NAME_KEY(credId));
}


