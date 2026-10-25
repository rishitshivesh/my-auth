"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AccountMenu, CommandPalette, ConsoleLayout, SentryButton, ThemeToggle, useCommandShortcut,
  type AccountMenuItem,
} from "@repo/ui";
import { Search } from "lucide-react";
import type { NavEntry } from "@/constants/navigation";
import { useCopy, type CopyKey } from "@/i18n";
import { usePermission } from "@/hooks/use-permission";
import { NavList } from "../components/NavList";
import { groupBySection, visibleEntries } from "../model/nav";
import { navCommandGroup } from "../model/command-groups";

export interface ConsoleShellProps {
  entries: readonly NavEntry[];
  /** Title block copy key, e.g. "tenant.shell.title". */
  titleKey: CopyKey;
  identity: string;
  accountItems: readonly AccountMenuItem[];
  onSignOut: () => void;
  /** Workspace switcher, platform badge etc. */
  headerStart?: ReactNode;
  children: ReactNode;
}

/** Shared composition for the tenant console, platform console and account shell. */
export function ConsoleShell({
  entries, titleKey, identity, accountItems, onSignOut, headerStart, children,
}: ConsoleShellProps) {
  const { t, tk } = useCopy();
  const router = useRouter();
  const { can, isReady } = usePermission();
  const [paletteOpen, setPaletteOpen] = useState(false);

  const visible = useMemo(() => visibleEntries(entries, can, isReady), [entries, can, isReady]);
  const sections = useMemo(() => groupBySection(visible), [visible]);
  const togglePalette = useCallback(() => setPaletteOpen((open) => !open), []);
  useCommandShortcut(togglePalette);

  const groups = useMemo(
    () => [navCommandGroup("nav", tk(titleKey), visible, (e) => tk(e.labelKey), (href) => router.push(href))],
    [visible, tk, titleKey, router],
  );

  return (
    <ConsoleLayout
      brand={<span className="font-display text-sm font-semibold">{tk(titleKey)}</span>}
      nav={<NavList sections={sections} />}
      labels={{
        skipToContent: t("common.labels.skipToContent"),
        openNavigation: t("common.actions.openMenu"),
        navigation: t("common.labels.mainNavigation"),
      }}
      header={
        <>
          <div className="mr-auto flex min-w-0 items-center gap-2">{headerStart}</div>
          <SentryButton variant="outline" size="sm" onClick={togglePalette} aria-label={t("common.command.trigger")}>
            <Search aria-hidden="true" className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">{t("common.command.trigger")}</span>
          </SentryButton>
          <ThemeToggle label={t("common.labels.toggleTheme")} />
          <AccountMenu
            triggerLabel={t("account.shell.menuLabel")}
            identityLabel={t("account.shell.signedInAs", { identity })}
            items={accountItems}
            footerItems={[{ id: "sign-out", label: t("common.actions.signOut"), onSelect: onSignOut }]}
          />
        </>
      }
    >
      {children}
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        groups={groups}
        title={t("common.command.heading")}
        description={t("common.command.placeholder")}
        placeholder={t("common.command.placeholder")}
        emptyLabel={t("common.command.empty")}
      />
    </ConsoleLayout>
  );
}
