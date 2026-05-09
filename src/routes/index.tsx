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
  const [hasStarted, setHasStarted] = useState(false);
  const [offline, setOffline] = useState(true);
  const [latest, setLatest] = useState<SensorPayload | null>(null);
  const [oilSeries, setOilSeries] = useState<Series>([]);
  const [flowSeries, setFlowSeries] = useState<Series>([]);
  const [vibSeries, setVibSeries] = useState<Series>([]);
  const [healthSeries, setHealthSeries] = useState<Series>([]);
  const counter = useRef(0);

  useEffect(() => {
    const offStatus = sim.onStatus(setRunning);
    const offData = (p: SensorPayload) => {
      // Update latest state regardless of connection (could be simulator)
      setLatest(p);

      // Only skip chart updates if we literally have no data (STOPPED or ERROR without payload)
      if (p.status !== "RUNNING") return;

      counter.current += 1;
      const t = counter.current;
      setOilSeries((s) => trim([...s, { t, v: p.oilTemp }]));
      setFlowSeries((s) => trim([...s, { t, v: p.flow }]));
      setVibSeries((s) => trim([...s, { t, v: p.vibration }]));
      setHealthSeries((s) => trim([...s, { t, v: p.healthIndex }]));
    };
    const offDataListener = sim.onData(offData);
    const offServer = sim.onServerStatus(setOffline);
    return () => {
      offStatus();
      offDataListener();
      offServer();
    };
  }, []);

  const handleStart = () => {
    setLatest(null); // Clear previous errors
    setHasStarted(true);
    counter.current = 0;
    setOilSeries([]);
    setFlowSeries([]);
    setVibSeries([]);
    setHealthSeries([]);
    sim.start();
  };

  const handleStop = () => {
    setHasStarted(false);
    setLatest(null);
    sim.stop();
  };

  const handleTryAgain = async () => {
    handleStop();
    // Small delay to ensure backend cleanup completes
    setTimeout(() => {
      handleStart();
    }, 100);
  };

  const oilStatus = !latest
    ? "muted"
    : latest.oilTemp > THRESH.oilTempMax
      ? "crit"
      : latest.oilTemp > THRESH.oilTempMax * 0.9 // Warn if near 41
        ? "warn"
        : latest.mlPrediction?.temperature === "FAILURE"
          ? "crit"
          : latest.mlPrediction?.temperature === "WARNING"
            ? "warn"
            : "ok";

  const diffStatus = !latest || latest.tempDiff === null
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
      : latest.vibration > THRESH.vibrationMax * 0.8 // Warn if near 4.0
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
    <div className="relative min-h-screen bg-background text-foreground">
      {/* Server Offline Warning */}
      {offline && (
        <div className="bg-destructive/10 border-b border-destructive/20 py-2 text-center text-[11px] font-medium text-destructive">
          BACKEND SERVER OFFLINE: Please run 'npm run dev' inside the /backend folder
        </div>
      )}

      {/* Machine Connection Overlay - Only shown if not in simulator and hardware fails */}
      {hasStarted && latest && !latest.machineConnected && latest.mode !== "SIMULATOR" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="max-w-md rounded-2xl border border-destructive/20 bg-card p-8 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21 2-2 2m-7.61 7.61a2 2 0 1 0 2.82 2.82"/><path d="M10 14 8 16"/><path d="m6.63 6.63 3.37 3.37"/><path d="M5 19 2 22"/><path d="M22 2 15 9"/><path d="M9 15 2 22"/><path d="M18 13v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h6"/><path d="m22 2-7 7"/></svg>
            </div>
            <h2 className="mt-4 text-xl font-bold">Machine Not Attached</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Could not detect Arduino on the configured port.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button 
                onClick={handleTryAgain}
                className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                Try Again
              </button>
              <button 
                onClick={handleStop}
                className="w-full rounded-lg border border-border bg-background px-4 py-2.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                Go Home
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 sm:py-8">
        {/* Header */}
        <header className="mb-6 flex flex-col gap-1 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              <span
                className="inline-block h-1.5 w-1.5 rounded-full bg-primary"
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
          onStop={handleStop}
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
            label="Atmospheric Temp"
            value={latest?.ambientTemp ?? 0}
            unit="°C"
          />
          <MetricCard
            label="ΔT (Oil − Atmos)"
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
            unit="m/s²"
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
              unit="m/s²"
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
            <span className="font-mono">ws://localhost:3001</span>
          </span>
          <span>v1.0 · Serial telemetry active</span>
        </footer>
      </div>
    </div>
  );
}

function trim(s: Series): Series {
  return s.length > MAX_POINTS ? s.slice(s.length - MAX_POINTS) : s;
}
