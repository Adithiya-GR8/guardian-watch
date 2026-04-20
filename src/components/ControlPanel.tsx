import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Play, Square } from "lucide-react";

type Props = {
  running: boolean;
  onStart: () => void;
  onStop: () => void;
};

export function ControlPanel({ running, onStart, onStop }: Props) {
  return (
    <div
      className="flex flex-col items-start justify-between gap-4 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center"
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2.5">
          <span
            className={cn(
              "pulse-dot inline-block h-2.5 w-2.5 rounded-full",
              running ? "bg-success" : "bg-critical",
            )}
          />
          <span className="text-sm font-medium text-foreground">
            System {running ? "Running" : "Stopped"}
          </span>
        </div>
        <div className="hidden h-8 w-px bg-border sm:block" />
        <div className="hidden text-xs text-muted-foreground sm:block">
          {running
            ? "Streaming sensor data · 1 Hz"
            : "Press Start to begin acquisition"}
        </div>
      </div>

      <div className="flex w-full gap-2 sm:w-auto">
        <Button
          onClick={onStart}
          disabled={running}
          className="flex-1 gap-2 sm:flex-none"
        >
          <Play className="h-4 w-4" />
          Start System
        </Button>
        <Button
          onClick={onStop}
          disabled={!running}
          variant="outline"
          className="flex-1 gap-2 sm:flex-none"
        >
          <Square className="h-4 w-4" />
          Stop
        </Button>
      </div>
    </div>
  );
}
