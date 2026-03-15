"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { useEmailAuthFlow } from "@/hooks/use-email-auth-flow";
import { EmailStep } from "./email-step";
import { MethodSelectionStep } from "./method-selection-step";
import { CredentialsStep } from "./credentials-step";
import { useState } from "react";
import { useAuth } from "@fortknox/sdk";

interface StepBasedAuthFlowProps {
  primaryColor?: string;
}

export function StepBasedAuthFlow({
  primaryColor = "#6366f1",
}: StepBasedAuthFlowProps) {
  const router = useRouter();
  const flow = useEmailAuthFlow();
  const { client } = useAuth();
  const [passwordPolicy] = useState<any>({
    minLength: 8,
    requireUppercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
  });

  const handleEmailSubmit = async (email: string) => {
    try {
      await flow.submitEmail(email);
    } catch (err) {
      console.error("[v0] Email submission error:", err);
    }
  };

  const handleCredentialsSubmit = async (email: string, password?: string) => {
    try {
      const result = await client.login({ email, password: password as string });
      if (result.mfaRequired && (result as any).tempToken) {
        sessionStorage.setItem("_fk_mfa_temp_token", (result as any).tempToken);
        router.push("/u/mfa");
        return;
      }
      router.push("/dashboard");
    } catch (err: any) {
      console.error("[FortKnox] Login error:", err);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {flow.step === "email" && (
        <EmailStep
          key="email"
          onSubmit={handleEmailSubmit}
          loading={flow.loading}
          error={flow.error}
          primaryColor={primaryColor}
        />
      )}

      {flow.step === "method-selection" && flow.loginIntent && (
        <MethodSelectionStep
          key="methods"
          loginIntent={flow.loginIntent}
          onSelectMethod={flow.selectMethod}
          onChangeEmail={flow.goBack}
          loading={flow.loading}
          primaryColor={primaryColor}
        />
      )}

      {flow.step === "credentials" &&
        flow.selectedMethod &&
        flow.loginIntent && (
          <CredentialsStep
            key="credentials"
            email={flow.email}
            method={flow.selectedMethod}
            onSubmit={handleCredentialsSubmit}
            onBack={flow.goBack}
            loading={flow.loading}
            error={flow.error}
            passwordPolicy={passwordPolicy}
            primaryColor={primaryColor}
          />
        )}
    </AnimatePresence>
  );
}
