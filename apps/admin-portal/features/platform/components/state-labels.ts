import type { PageStateLabels } from "@/components/page/PageState";
import type { Translate } from "@/i18n/translate";
import type { en } from "@/i18n/en";

export function platformStateLabels(t: Translate<typeof en>): PageStateLabels {
  return {
    loading: t("states.loading.title"),
    deniedTitle: t("platform.common.deniedTitle"),
    deniedBody: t("platform.common.deniedBody"),
    errorTitle: t("platform.common.errorTitle"),
    errorBody: t("platform.common.errorBody"),
    unavailableTitle: t("platform.common.unavailableTitle"),
    unavailableBody: t("platform.common.unavailableBody"),
    retry: t("platform.common.retry"),
  };
}
