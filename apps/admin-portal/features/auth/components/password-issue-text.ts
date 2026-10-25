import { t } from "@/i18n";
import type { PasswordIssue } from "../model/password-policy";

export function passwordIssueText(issue: PasswordIssue): string | undefined {
  switch (issue) {
    case "too-short":
      return t("auth.signup.passwordIssues.tooShort");
    case "too-long":
      return t("auth.signup.passwordIssues.tooLong");
    case "contains-email":
      return t("auth.signup.passwordIssues.containsEmail");
    default:
      return undefined;
  }
}
