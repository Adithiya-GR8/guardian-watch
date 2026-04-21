import type { MlState } from "@/lib/socket";
import { cn } from "@/lib/utils";
import { Activity, Thermometer } from "lucide-react";

type Props = {
  vibration: MlState;
  temperature: MlState;
  failure: boolean;
};

const statusBg: Record<MlState, string> = {
  NORMAL: "bg-success/10",
  WARNING: "bg-warning/10",
  FAILURE: "bg-critical/10",
  MODEL_NOT_FOUND: "bg-muted/10",
  SERVICE_DOWN: "bg-muted/10",
};

const statusColor: Record<MlState, string> = {
  NORMAL: "text-success",
  WARNING: "text-warning",
  FAILURE: "text-critical",
  MODEL_NOT_FOUND: "text-muted-foreground",
  SERVICE_DOWN: "text-muted-foreground",
};

export function MLPanel({ vibration, temperature, failure }: Props) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 transition-colors",
        failure ? "border-critical/50" : "border-border",
      )}
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          ML Prediction
        </h3>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            failure
              ? "bg-critical/15 text-critical"
              : vibration === "WARNING" || temperature === "WARNING"
                ? "bg-warning/15 text-warning"
                : "bg-success/15 text-success",
          )}
        >
          {failure
            ? "Failure Imminent"
            : vibration === "WARNING" || temperature === "WARNING"
              ? "Warning"
              : "Normal"}
        </span>
      </div>

      <div className="mt-4 space-y-2.5">
        <ModelRow
          icon={<Activity className="h-4 w-4" />}
          label="Vibration model"
          state={vibration}
        />
        <ModelRow
          icon={<Thermometer className="h-4 w-4" />}
          label="Temperature model"
          state={temperature}
        />
      </div>

      {failure && (
        <div className="mt-4 rounded-lg border border-critical/40 bg-critical/10 px-3 py-2.5 text-sm text-critical">
          ⚠ Transformer is likely to fail — initiate cooling protocol.
        </div>
      )}
    </div>
  );

  function ModelRow({
    icon,
    label,
    state,
  }: {
    icon: React.ReactNode;
    label: string;
    state: MlState;
  }) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/40 px-3 py-2.5">
        <div className="flex items-center gap-2.5 text-sm text-foreground">
          <span className="text-muted-foreground">{icon}</span>
          {label}
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", statusBg[state].replace("/10", ""))} />
          <span className={cn("font-mono text-xs uppercase tracking-wider", statusColor[state])}>
            {state.replace("_", " ")}
          </span>
        </div>
      </div>
    );
  }
}
