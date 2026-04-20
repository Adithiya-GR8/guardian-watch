import { ALERT_LABEL, ALERT_SEVERITY, type AlertCode } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { AlertTriangle, ShieldCheck } from "lucide-react";

export function AlertPanel({ alerts }: { alerts: AlertCode[] }) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Active Alerts
        </h3>
        <span className="text-xs text-muted-foreground">
          {alerts.length} active
        </span>
      </div>

      <div className="mt-4 space-y-2">
        {alerts.length === 0 ? (
          <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-3">
            <ShieldCheck className="h-4 w-4 text-success" />
            <span className="text-sm text-muted-foreground">
              All systems nominal
            </span>
          </div>
        ) : (
          alerts.map((code) => {
            const sev = ALERT_SEVERITY[code];
            return (
              <div
                key={code}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2.5",
                  sev === "critical"
                    ? "border-critical/40 bg-critical/10"
                    : "border-warning/40 bg-warning/10",
                )}
              >
                <AlertTriangle
                  className={cn(
                    "h-4 w-4 shrink-0",
                    sev === "critical" ? "text-critical" : "text-warning",
                  )}
                />
                <div className="flex-1 text-sm text-foreground">
                  {ALERT_LABEL[code]}
                </div>
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-wider",
                    sev === "critical" ? "text-critical" : "text-warning",
                  )}
                >
                  {sev}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
