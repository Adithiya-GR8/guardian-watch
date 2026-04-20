import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { sim, type SensorPayload, THRESH } from "@/lib/socket";
import { MetricCard } from "@/components/MetricCard";
import { Chart } from "@/components/Chart";
import { HealthGauge } from "@/components/HealthGauge";
import { ControlPanel } from "@/components/ControlPanel";
import { AlertPanel } from "@/components/AlertPanel";
import { MLPanel } from "@/components/MLPanel";
import { SystemStatus } from "@/components/SystemStatus";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Transformer Health Monitor — Live Dashboard" },
      {
        name: "description",
        content:
          "Real-time AI-based transformer health monitoring with predictive cooling, ML failure prediction, and live sensor telemetry.",
      },
      { property: "og:title", content: "Transformer Health Monitor" },
      {
        property: "og:description",
        content:
          "Industrial dashboard for live transformer telemetry and ML-driven failure prediction.",
      },
    ],
  }),
  component: Dashboard,
});

const MAX_POINTS = 60;

type Series = { t: number; v: number }[];

function Dashboard() {
  const [running, setRunning] = useState(false);
  const [latest, setLatest] = useState<SensorPayload | null>(null);
  const [oilSeries, setOilSeries] = useState<Series>([]);
  const [flowSeries, setFlowSeries] = useState<Series>([]);
  const [vibSeries, setVibSeries] = useState<Series>([]);
  const [healthSeries, setHealthSeries] = useState<Series>([]);
  const counter = useRef(0);

  useEffect(() => {
    const offStatus = sim.onStatus(setRunning);
    const offData = sim.onData((p) => {
      counter.current += 1;
      const t = counter.current;
      setLatest(p);
      setOilSeries((s) => trim([...s, { t, v: p.oilTemp }]));
      setFlowSeries((s) => trim([...s, { t, v: p.flow }]));
      setVibSeries((s) => trim([...s, { t, v: p.vibration }]));
      setHealthSeries((s) => trim([...s, { t, v: p.healthIndex }]));
    });
    return () => {
      offStatus();
      offData();
    };
  }, []);

  const handleStart = () => {
    counter.current = 0;
    setOilSeries([]);
    setFlowSeries([]);
    setVibSeries([]);
    setHealthSeries([]);
    sim.start();
  };

  const oilStatus = !latest
    ? "muted"
    : latest.mlPrediction.temperature === "CRITICAL"
      ? "crit"
      : latest.mlPrediction.temperature === "WARNING"
        ? "warn"
        : "ok";
  const ambStatus = "ok" as const;
  const diffStatus = !latest
    ? "muted"
    : latest.tempDiff > THRESH.tempDiffMax
      ? "crit"
      : latest.tempDiff > THRESH.tempDiffMax * 0.75
        ? "warn"
        : "ok";
  const flowStatus = !latest
    ? "muted"
    : latest.flow < THRESH.flowMin
      ? "crit"
      : latest.flow < THRESH.flowMin * 1.2
        ? "warn"
        : "ok";
  const vibStatus = !latest
    ? "muted"
    : latest.vibration > THRESH.vibrationMax
      ? "crit"
      : latest.vibration > THRESH.vibrationMax * 0.7
        ? "warn"
        : "ok";
  const healthStatus = !latest
    ? "muted"
    : latest.healthIndex < 50
      ? "crit"
      : latest.healthIndex < 80
        ? "warn"
        : "ok";

  return (
    <div className="grid-bg min-h-screen text-foreground">
      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-1 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--primary)", boxShadow: "0 0 8px var(--primary)" }}
              />
              Substation TR-04 · Live Telemetry
            </div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Transformer Health Monitor
            </h1>
          </div>
          <div className="font-mono text-xs text-muted-foreground">
            {latest
              ? new Date(latest.ts).toLocaleTimeString([], { hour12: false })
              : "—:—:—"}{" "}
            · 4 sensors · 2 ML models
          </div>
        </header>

        {/* Control */}
        <ControlPanel
          running={running}
          onStart={handleStart}
          onStop={() => sim.stop()}
        />

        {/* Metrics grid */}
        <section className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
          <MetricCard
            label="Oil Temp"
            value={latest?.oilTemp ?? 0}
            unit="°C"
            status={oilStatus}
          />
          <MetricCard
            label="Ambient"
            value={latest?.ambientTemp ?? 0}
            unit="°C"
            status={ambStatus}
          />
          <MetricCard
            label="ΔT (Oil − Amb)"
            value={latest?.tempDiff ?? 0}
            unit="°C"
            status={diffStatus}
          />
          <MetricCard
            label="Flow Rate"
            value={latest?.flow ?? 0}
            unit="L/min"
            status={flowStatus}
          />
          <MetricCard
            label="Vibration"
            value={latest?.vibration ?? 0}
            unit="g"
            status={vibStatus}
            precision={3}
          />
          <MetricCard
            label="Health Index"
            value={latest?.healthIndex ?? 0}
            unit="/100"
            status={healthStatus}
            precision={0}
          />
        </section>

        {/* Main content */}
        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          {/* Charts column */}
          <div className="grid gap-4 lg:col-span-2 sm:grid-cols-2">
            <Chart
              title="Oil Temperature"
              unit="°C"
              data={oilSeries}
              color="--chart-1"
            />
            <Chart
              title="Flow Rate"
              unit="L/min"
              data={flowSeries}
              color="--chart-2"
            />
            <Chart
              title="Vibration"
              unit="g"
              data={vibSeries}
              color="--chart-3"
              precision={3}
            />
            <Chart
              title="Health Index"
              unit="/100"
              data={healthSeries}
              color="--chart-5"
              domain={[0, 100]}
              precision={0}
            />
          </div>

          {/* Side column */}
          <div className="grid gap-4">
            <HealthGauge value={latest?.healthIndex ?? 0} />
            <SystemStatus
              health={latest?.healthIndex ?? 0}
              alerts={latest?.alerts.length ?? 0}
              failure={latest?.mlPrediction.failure ?? false}
              running={running}
            />
            <MLPanel
              vibration={latest?.mlPrediction.vibration ?? "NORMAL"}
              temperature={latest?.mlPrediction.temperature ?? "NORMAL"}
              failure={latest?.mlPrediction.failure ?? false}
            />
            <AlertPanel alerts={latest?.alerts ?? []} />
          </div>
        </section>

        <footer className="mt-8 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Endpoints: <span className="font-mono">POST /api/start</span> ·{" "}
            <span className="font-mono">POST /api/stop</span> ·{" "}
            <span className="font-mono">/ws/data</span>
          </span>
          <span>v1.0 · Mock data layer active</span>
        </footer>
      </div>
    </div>
  );
}

function trim(s: Series): Series {
  return s.length > MAX_POINTS ? s.slice(s.length - MAX_POINTS) : s;
}
