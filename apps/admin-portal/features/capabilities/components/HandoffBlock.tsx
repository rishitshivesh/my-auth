import { ClipboardList } from "lucide-react";
import { GlassCard } from "@repo/ui";
import { useCopy } from "@/i18n";
import type { CapabilityScreenSpec } from "../model/types";

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h3 className="font-display text-xs font-semibold text-foreground">{heading}</h3>
      {children}
    </section>
  );
}

/** Written TODO for the implementer: purpose, persona, contract, permissions, audit, acceptance. */
export function HandoffBlock({ spec }: { spec: CapabilityScreenSpec }) {
  const { t, tk } = useCopy();
  const headingId = `cap-${spec.family}-handoff`;
  return (
    <GlassCard tier={1} role="region" aria-labelledby={headingId} className="space-y-4 border-dashed p-5" data-capability-state="handoff">
      <h2 id={headingId} className="flex items-center gap-2 font-mono text-sm font-semibold text-foreground">
        <ClipboardList aria-hidden="true" className="h-4 w-4" />
        {t("capabilities.common.handoffHeading")}
      </h2>
      <Group heading={t("capabilities.common.purpose")}>
        <p className="font-body text-sm text-foreground">{tk(spec.purpose)}</p>
      </Group>
      <Group heading={t("capabilities.common.persona")}>
        <p className="font-body text-sm text-foreground">{tk(spec.persona)}</p>
      </Group>
      <Group heading={t("capabilities.common.contract")}>
        <p className="font-body text-xs text-muted-foreground">{t("capabilities.common.contractNote")}</p>
        <ul className="space-y-1 font-mono text-xs text-foreground">
          {spec.contracts.map((route) => (
            <li key={`${route.method}${route.path}`} className="break-all">
              {route.method} {route.path} · {route.dto}
            </li>
          ))}
        </ul>
      </Group>
      <Group heading={t("capabilities.common.permissions")}>
        <ul className="flex flex-wrap gap-2 font-mono text-xs text-foreground">
          {spec.permissions.map((p) => <li key={p} className="rounded-xs border border-border bg-muted px-2 py-0.5">{p}</li>)}
        </ul>
      </Group>
      <Group heading={t("capabilities.common.audit")}>
        <ul className="flex flex-wrap gap-2 font-mono text-xs text-foreground">
          {spec.auditEvents.map((e) => <li key={e} className="rounded-xs border border-border bg-muted px-2 py-0.5">{e}</li>)}
        </ul>
      </Group>
      <Group heading={t("capabilities.common.acceptance")}>
        <ul className="list-disc space-y-1 pl-5 font-body text-sm text-foreground">
          {spec.acceptance.map((key) => <li key={key}>{tk(key)}</li>)}
        </ul>
      </Group>
    </GlassCard>
  );
}
