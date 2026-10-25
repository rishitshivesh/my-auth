import type { PageStateLabels } from "@/components/page/PageState";
import type { Translate } from "@/i18n/translate";
import type { en } from "@/i18n/en";

/** Page-state labels from the tenant-admin catalogue. */
export function tenantStateLabels(t: Translate<typeof en>): PageStateLabels {
  return {
    loading: t("tenantAdmin.common.loading"),
    deniedTitle: t("tenantAdmin.common.deniedTitle"),
    deniedBody: t("tenantAdmin.common.deniedBody"),
    errorTitle: t("tenantAdmin.common.errorTitle"),
    errorBody: t("tenantAdmin.common.errorBody"),
    unavailableTitle: t("tenantAdmin.common.unavailableTitle"),
    unavailableBody: t("tenantAdmin.common.unavailableBody"),
    retry: t("tenantAdmin.common.retry"),
  };
}
