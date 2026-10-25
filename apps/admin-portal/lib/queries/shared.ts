import { authClient } from "@/lib/auth-client";

export function apiUrl(path: string): string {
  return `${authClient.getBaseURL()}${path}`;
}
