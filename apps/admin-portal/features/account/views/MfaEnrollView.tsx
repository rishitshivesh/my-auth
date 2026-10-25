"use client";

import { useCopy } from "@/i18n";
import { RecoverySection } from "./RecoverySection";
import { TotpSection } from "./TotpSection";
import { PageFrame } from "@/components/page/PageFrame";

/**
 * Authenticator enrolment for a signed-in user. Enrolment forced at sign-in
 * (`mfa_enrollment_required`) has no session yet and lives in features/auth (MfaEnrollView).
 */
export function MfaEnrollView() {
  const { t } = useCopy();
  return (
    <PageFrame size="narrow" title={t("account.mfa.enroll.title")} subtitle={t("account.mfa.description")}>
      <TotpSection />
      <RecoverySection />
    </PageFrame>
  );
}
