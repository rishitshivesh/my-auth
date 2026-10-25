import { cn } from "@repo/ui/lib/utils";

export interface NoticeProps {
  tone: "error" | "success" | "info";
  children: string;
  className?: string;
}

/** Inline outcome message: errors interrupt (alert), others are polite status text. */
export function Notice({ tone, children, className }: NoticeProps) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-sm border px-3 py-2 font-body text-sm",
        tone === "error" && "border-destructive text-destructive",
        tone === "success" && "border-success text-success-text",
        tone === "info" && "border-border bg-muted text-foreground",
        className,
      )}
    >
      {children}
    </p>
  );
}
