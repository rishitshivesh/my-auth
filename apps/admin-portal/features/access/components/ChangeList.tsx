export interface ChangeListProps {
  label: string;
  names: readonly string[];
  /** Text marker so meaning never relies on colour alone, e.g. "+" or "-". */
  marker: string;
  emptyText: string;
}

/** A labelled list of names (roles or permissions) in the mono role. */
export function ChangeList({ label, names, marker, emptyText }: ChangeListProps) {
  return (
    <section aria-label={label} className="space-y-1.5">
      <h4 className="font-display text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</h4>
      {names.length === 0 ? (
        <p className="font-body text-sm text-muted-foreground">{emptyText}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {names.map((name) => (
            <li key={name} className="max-w-full break-all rounded-sm border border-border bg-muted px-2 py-1 font-mono text-xs text-foreground">
              <span aria-hidden="true" className="mr-1.5 font-semibold">{marker}</span>
              {name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
