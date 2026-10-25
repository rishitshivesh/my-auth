"use client";

import { useCopy } from "@/i18n";
import { RecoverySection } from "./RecoverySection";
import { TotpSection } from "./TotpSection";
import { PageFrame } from "@/components/page/PageFrame";

/**
 * Authenticator enrolment page (`/mfa/enroll`).
 * TODO(gap:Pre-session MFA enrollment): enrolment forced at sign-in (`mfa_enrollment_required`)
 * has no endpoint that accepts the enrolment token, so this page needs an existing session.
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
