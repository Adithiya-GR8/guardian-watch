import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { t: number; v: number };

type Props = {
  title: string;
  unit?: string;
  data: Point[];
  color?: string; // css var name, e.g. "--chart-1"
  domain?: [number | "auto", number | "auto"];
  precision?: number;
};

export function Chart({
  title,
  unit,
  data,
  color = "--chart-1",
  domain = ["auto", "auto"],
  precision = 2,
}: Props) {
  const stroke = `var(${color})`;
  const id = `grad-${color.replace(/[^a-z0-9]/gi, "")}`;
  const last = data.length ? data[data.length - 1].v : 0;

  return (
    <div
      className="rounded-xl border border-border bg-card p-5"
      style={{ boxShadow: "var(--shadow-panel)" }}
    >
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {title}
        </h3>
        <div className="font-mono text-sm tabular-nums text-foreground">
          {last.toFixed(precision)}
          {unit && <span className="ml-1 text-muted-foreground">{unit}</span>}
        </div>
      </div>
      <div className="mt-3 h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
                <stop offset="100%" stopColor={stroke} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="t" hide />
            <YAxis
              domain={domain}
              width={36}
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              cursor={{ stroke: "var(--border)" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
                color: "var(--foreground)",
              }}
              labelFormatter={() => ""}
              formatter={(v: number) => [v.toFixed(precision) + (unit ? ` ${unit}` : ""), title]}
            />
            <Area
              type="monotone"
              dataKey="v"
              stroke={stroke}
              strokeWidth={1.75}
              fill={`url(#${id})`}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
