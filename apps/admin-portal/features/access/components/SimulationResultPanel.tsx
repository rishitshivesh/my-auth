import { useCopy } from "@/i18n";
import { mismatchedParts, type SimulationView } from "../model/simulation";
import type { SimulationTraceEntry } from "../model/types";

function TraceItem({ entry, label }: { entry: SimulationTraceEntry; label: string }) {
  const { t } = useCopy();
  const missing = mismatchedParts(entry);
  return (
    <li className="rounded-sm border border-border p-3">
      <p className="break-words font-body text-sm text-foreground">
        <span className="font-semibold">{entry.policyName}</span>
        {entry.statementSid && <span className="ml-2 break-all font-mono text-xs text-muted-foreground">{entry.statementSid}</span>}
      </p>
      <p className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {t(entry.effect === "Allow" ? "access.policies.detail.allow" : "access.policies.detail.deny")} · {label}
      </p>
      {missing.length > 0 && (
        <p className="font-body text-xs text-muted-foreground">
          {t("access.simulator.result.didNotMatch", { parts: missing.map((m) => t(`access.simulator.result.parts.${m}`)).join(", ") })}
        </p>
      )}
    </li>
  );
}

export interface SimulationResultPanelProps {
  view: SimulationView;
  /** Whether the viewer can open a policy to fix the decisive rule. */
  policiesHref?: string;
}

/** Renders only what the service returned: decision, reason, decisive policies and trace. */
export function SimulationResultPanel({ view }: SimulationResultPanelProps) {
  const { t } = useCopy();
  const allowed = view.outcome === "allow";
  return (
    <section aria-labelledby="simulation-result-title" className="space-y-5 rounded-md border border-border bg-card p-4 sm:p-6">
      <div role="status" aria-live="polite" className="space-y-1">
        <h2 id="simulation-result-title" className="font-display text-lg font-semibold text-foreground">
          {t(allowed ? "access.simulator.result.allowed" : "access.simulator.result.denied")}
        </h2>
        <p className="font-body text-sm text-foreground">{t(`access.simulator.explanations.${view.explanation}`)}</p>
        <p className="font-body text-xs text-muted-foreground">{t("access.simulator.result.evaluated", { count: view.policiesEvaluated })}</p>
      </div>

      {view.decisive.length > 0 && (
        <section aria-label={t("access.simulator.result.decisive")} className="space-y-1.5">
          <h3 className="font-display text-sm font-semibold text-foreground">{t("access.simulator.result.decisive")}</h3>
          <ul className="flex flex-wrap gap-2">
            {view.decisive.map((name) => (
              <li key={name} className="max-w-full break-all rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground">{name}</li>
            ))}
          </ul>
        </section>
      )}

      {view.explanation === "boundaryDeny" && (
        <p role="note" className="rounded-sm border border-border bg-muted p-3 font-body text-sm text-foreground">
          {t("access.simulator.boundaryNote")}
        </p>
      )}
      {view.explanation === "implicitDeny" && view.applied.length === 0 && (
        <p role="note" className="rounded-sm border border-border bg-muted p-3 font-body text-sm text-foreground">
          {t("access.simulator.noApplicable")}
        </p>
      )}

      <section aria-label={t("access.simulator.result.applied")} className="space-y-2">
        <h3 className="font-display text-sm font-semibold text-foreground">{t("access.simulator.result.applied")}</h3>
        {view.applied.length === 0 ? (
          <p className="font-body text-sm text-muted-foreground">{t("access.simulator.result.noneApplied")}</p>
        ) : (
          <ul className="space-y-2">
            {view.applied.map((entry, index) => (
              <TraceItem key={`${entry.policyName}-${entry.statementSid ?? index}`} entry={entry} label={t("access.simulator.result.matched")} />
            ))}
          </ul>
        )}
      </section>

      {view.nearMisses.length > 0 && (
        <section aria-label={t("access.simulator.result.nearMisses")} className="space-y-2">
          <h3 className="font-display text-sm font-semibold text-foreground">{t("access.simulator.result.nearMisses")}</h3>
          <p className="font-body text-xs text-muted-foreground">{t("access.simulator.result.nearMissesHint")}</p>
          <ul className="space-y-2">
            {view.nearMisses.map((entry, index) => (
              <TraceItem key={`${entry.policyName}-${entry.statementSid ?? index}-n`} entry={entry} label={t("access.simulator.result.notApplied")} />
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}
