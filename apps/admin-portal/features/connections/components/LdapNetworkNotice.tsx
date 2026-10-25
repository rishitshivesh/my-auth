import { GlassCard } from "@repo/ui";
import { useCopy } from "@/i18n";

/** Explains why a directory on a private network may be refused and who can change that. */
export function LdapNetworkNotice() {
  const { t } = useCopy();
  return (
    <GlassCard tier={1} className="space-y-2 p-6">
      <section aria-labelledby="ldap-network-heading" className="space-y-2">
        <h2 id="ldap-network-heading" className="font-display text-base font-semibold">{t("tenantIntegrations.ldap.networkHeading")}</h2>
        <p className="font-body text-sm text-foreground">{t("tenantIntegrations.ldap.networkPrivate")}</p>
        <p className="font-body text-sm text-muted-foreground">{t("tenantIntegrations.ldap.networkTip")}</p>
      </section>
    </GlassCard>
  );
}
