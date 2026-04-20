import { cn } from "@/lib/utils";

type Status = "ok" | "warn" | "crit" | "muted";

type Props = {
  label: string;
  value: number | string;
  unit?: string;
  status?: Status;
  hint?: string;
  precision?: number;
};

const statusRing: Record<Status, string> = {
  ok: "before:bg-success",
  warn: "before:bg-warning",
  crit: "before:bg-critical",
  muted: "before:bg-muted-foreground/40",
};

const statusText: Record<Status, string> = {
  ok: "text-success",
  warn: "text-warning",
  crit: "text-critical",
  muted: "text-muted-foreground",
};

export function MetricCard({
  label,
  value,
  unit,
  status = "ok",
  hint,
  precision = 2,
}: Props) {
  const display =
    typeof value === "number" ? value.toFixed(precision) : value;

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card p-5",
        "before:absolute before:left-0 before:top-0 before:h-full before:w-[3px]",
        statusRing[status],
      )}
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        <span className={cn("text-[10px] font-semibold uppercase tracking-wider", statusText[status])}>
          {status === "ok" ? "Nominal" : status === "warn" ? "Watch" : status === "crit" ? "Critical" : "—"}
        </span>
      </div>
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="font-mono text-3xl font-semibold tabular-nums text-foreground">
          {display}
        </span>
        {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
      </div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
