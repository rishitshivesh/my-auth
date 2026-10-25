import { useId } from "react";
import { GlassCard } from "@repo/ui";
import { CopyableValue } from "./CopyableValue";

export interface EndpointsPanelItem {
  id: string;
  label: string;
  value: string;
}

export interface EndpointsPanelProps {
  heading: string;
  description?: string;
  items: readonly EndpointsPanelItem[];
  note?: string;
}

/** Operational output: protocol addresses an integration needs. Read-only, never an editor. */
export function EndpointsPanel({ heading, description, items, note }: EndpointsPanelProps) {
  const headingId = useId();
  return (
    <GlassCard tier={1} className="space-y-4 p-6">
      <section aria-labelledby={headingId} className="space-y-4">
        <div className="space-y-1">
          <h2 id={headingId} className="font-display text-base font-semibold text-foreground">{heading}</h2>
          {description && <p className="font-body text-sm text-muted-foreground">{description}</p>}
        </div>
        <div className="space-y-4">
          {items.map((item) => <CopyableValue key={item.id} label={item.label} value={item.value} />)}
        </div>
        {note && <p className="font-body text-xs text-muted-foreground">{note}</p>}
      </section>
    </GlassCard>
  );
}
