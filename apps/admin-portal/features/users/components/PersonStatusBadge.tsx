import { StatusBadge } from "@repo/ui/components/sentry/StatusBadge";
import { useCopy } from "@/i18n";
import type { PersonStatus } from "../model/person";

const VARIANT = { active: "active", pending: "pending", suspended: "suspended", inactive: "system" } as const;

/** Status is always text as well as colour. */
export function PersonStatusBadge({ status }: { status: PersonStatus }) {
  const { t } = useCopy();
  return <StatusBadge status={VARIANT[status]}>{t(`users.status.${status}`)}</StatusBadge>;
}
