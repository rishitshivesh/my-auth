"use client";

import Link from "next/link";
import { accountRoutes } from "@/constants/routes";
import { useCopy } from "@/i18n";
import { SecurityTabs } from "../components/SecurityTabs";
import { ConnectionsSection } from "./ConnectionsSection";
import { PasskeysSection } from "./PasskeysSection";
import { PasswordSection } from "./PasswordSection";
import { RecoverySection } from "./RecoverySection";
import { TotpSection } from "./TotpSection";
import { PageFrame } from "@/components/page/PageFrame";

/** My security: password, authenticator, recovery codes, passkeys and connected accounts. */
export function SecurityView() {
  const { t } = useCopy();
  return (
    <PageFrame size="narrow" title={t("account.security.title")} subtitle={t("account.security.description")}>
      <SecurityTabs current="methods" />
      <PasskeysSection />
      <TotpSection />
      <RecoverySection />
      <ConnectionsSection />
      <PasswordSection />
      <p className="font-body text-sm text-muted-foreground">
        <Link
          href={accountRoutes.deleteAccount()}
          className="font-medium text-destructive underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("account.delete.title")}
        </Link>
      </p>
    </PageFrame>
  );
}

/** Second-factor devices only: the surface behind `/t/[slug]/security/devices`. */
export function DevicesView() {
  const { t } = useCopy();
  return (
    <PageFrame size="narrow" title={t("account.security.title")} subtitle={t("account.security.description")}>
      <SecurityTabs current="methods" />
      <PasskeysSection />
      <TotpSection />
      <RecoverySection />
    </PageFrame>
  );
}
