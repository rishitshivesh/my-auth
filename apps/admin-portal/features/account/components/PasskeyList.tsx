"use client";

import type { Passkey } from "@scrolloop/sdk";
import { SentryButton } from "@repo/ui";
import { PASSKEY_NAME_MAX_LENGTH } from "@/constants/limits";
import { useCopy } from "@/i18n";
import { formatDate } from "../model/sessions";
import { FieldInput } from "./FieldInput";
import { Notice } from "./Notice";

export interface PasskeyListProps {
  passkeys: readonly Passkey[];
  name: string;
  onNameChange: (value: string) => void;
  onAdd: () => void;
  adding: boolean;
  /** Add is impossible in this browser. */
  unsupported: boolean;
  /** Notice after a ceremony: cancelled/failed/none. */
  addMessage?: { tone: "error" | "info"; text: string };
  onRemove: (passkey: Passkey) => void;
}

export function PasskeyList({
  passkeys, name, onNameChange, onAdd, adding, unsupported, addMessage, onRemove,
}: PasskeyListProps) {
  const { t } = useCopy();
  const fallback = t("account.sessions.unknownLocation");
  return (
    <div className="space-y-4">
      {passkeys.length === 0 ? (
        <div className="space-y-1" role="status">
          <p className="font-body text-sm font-medium text-foreground">{t("account.passkeys.empty")}</p>
          <p className="font-body text-sm text-muted-foreground">{t("account.passkeys.emptyHint")}</p>
        </div>
      ) : (
        <ul className="divide-y divide-border rounded-sm border border-border">
          {passkeys.map((passkey) => {
            const label = passkey.deviceName || t("account.passkeys.unnamed");
            return (
              <li key={passkey.id} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="break-words font-body text-sm font-medium text-foreground">{label}</p>
                  <p className="font-body text-xs text-muted-foreground">
                    {t("account.passkeys.added", { date: formatDate(passkey.createdAt, fallback) })}
                    {" · "}
                    {passkey.lastUsedAt
                      ? t("account.passkeys.lastUsed", { date: formatDate(passkey.lastUsedAt, fallback) })
                      : t("account.passkeys.neverUsed")}
                  </p>
                </div>
                <SentryButton
                  variant="outline"
                  size="sm"
                  aria-label={t("account.passkeys.removeLabel", { name: label })}
                  onClick={() => onRemove(passkey)}
                >
                  {t("account.passkeys.remove")}
                </SentryButton>
              </li>
            );
          })}
        </ul>
      )}
      {unsupported ? (
        <Notice tone="info">{t("account.passkeys.unsupported")}</Notice>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1 sm:max-w-sm">
            <FieldInput
              label={t("account.passkeys.deviceName")}
              hint={`${t("account.passkeys.deviceNameHint")} ${t("account.passkeys.nicknameNote")}`}
              value={name}
              maxLength={PASSKEY_NAME_MAX_LENGTH}
              onChange={(e) => onNameChange(e.target.value)}
              optionalLabel={t("common.labels.optional")}
              disabled={adding}
            />
          </div>
          <SentryButton variant="primary" isLoading={adding} onClick={onAdd}>
            {adding ? t("account.passkeys.adding") : t("account.passkeys.add")}
          </SentryButton>
        </div>
      )}
      {addMessage && <Notice tone={addMessage.tone}>{addMessage.text}</Notice>}
    </div>
  );
}
