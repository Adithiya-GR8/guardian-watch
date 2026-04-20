import { cn } from "@/lib/utils";

type Props = {
  health: number;
  alerts: number;
  failure: boolean;
  running: boolean;
};

export function SystemStatus({ health, alerts, failure, running }: Props) {
  const overall: "Healthy" | "Degrading" | "Critical" | "Offline" = !running
    ? "Offline"
    : failure || health < 50
      ? "Critical"
      : alerts > 0 || health < 80
        ? "Degrading"
        : "Healthy";

  const color =
    overall === "Healthy"
      ? "text-success"
      : overall === "Degrading"
        ? "text-warning"
        : overall === "Critical"
          ? "text-critical"
          : "text-muted-foreground";

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
        Overall Status
      </h3>
      <div className="mt-3 flex items-baseline gap-3">
        <span className={cn("text-2xl font-semibold tracking-tight", color)}>
          {overall}
        </span>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <Stat label="Health" value={`${Math.round(health)}/100`} />
        <Stat label="Alerts" value={String(alerts)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm tabular-nums text-foreground">{value}</div>
    </div>
  );
}
