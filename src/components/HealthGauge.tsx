type Props = { value: number };

export function HealthGauge({ value }: Props) {
  const v = Math.max(0, Math.min(100, value));
  const zone =
    v >= 80 ? "ok" : v >= 50 ? "warn" : "crit";
  const color =
    zone === "ok" ? "var(--success)" : zone === "warn" ? "var(--warning)" : "var(--critical)";

  // Semicircle gauge — radius 80, arc length ≈ π * 80 ≈ 251.3
  const ARC = 251.3;
  const offset = ARC - (v / 100) * ARC;

  return (
    <div
      className="flex h-full flex-col rounded-xl border border-border bg-card p-5"
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Health Index
        </h3>
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color }}
        >
          {zone === "ok" ? "Healthy" : zone === "warn" ? "Degrading" : "Critical"}
        </span>
      </div>

      <div className="relative mt-2 flex flex-1 items-center justify-center">
        <svg viewBox="0 0 200 120" className="w-full max-w-[260px]">
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke="var(--muted)"
            strokeWidth="14"
            strokeLinecap="round"
          />
          <path
            d="M 20 100 A 80 80 0 0 1 180 100"
            fill="none"
            stroke={color}
            strokeWidth="14"
            strokeLinecap="round"
            strokeDasharray={ARC}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 800ms ease, stroke 400ms ease" }}
          />
        </svg>
        <div className="absolute bottom-2 flex flex-col items-center">
          <span className="font-mono text-5xl font-semibold tabular-nums text-foreground">
            {Math.round(v)}
          </span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>
      </div>

      <div className="mt-2 flex justify-between text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <span>0</span>
        <span className="text-success">80</span>
        <span>100</span>
      </div>
    </div>
  );
}
