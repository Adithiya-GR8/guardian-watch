// Real-time data layer.
// Currently uses a deterministic mock simulator that emits the exact JSON
// contract from the spec. To switch to a real backend, replace `connect()`
// with a WebSocket to `/ws/data` — the SensorPayload shape is unchanged.

export type MlState = "NORMAL" | "WARNING" | "CRITICAL";

export type SensorPayload = {
  oilTemp: number;
  ambientTemp: number;
  flow: number;
  vibration: number;
  tempDiff: number;
  healthIndex: number;
  alerts: AlertCode[];
  mlPrediction: {
    vibration: MlState;
    temperature: MlState;
    failure: boolean;
  };
  ts: number;
};

export type AlertCode =
  | "LOW_FLOW"
  | "HIGH_VIBRATION"
  | "HIGH_TEMP_DIFF"
  | "LOW_HEALTH"
  | "ML_FAILURE_PREDICTED";

type Listener = (p: SensorPayload) => void;

const THRESH = {
  flowMin: 2.5,
  vibrationMax: 0.35,
  tempDiffMax: 18,
  healthMin: 55,
};

class Sim {
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(running: boolean) => void>();
  private t = 0;
  // Drift state — slowly degrades to make the dashboard interesting
  private drift = 0;

  isRunning() {
    return this.timer !== null;
  }

  onData(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (running: boolean) => void) {
    this.statusListeners.add(fn);
    fn(this.isRunning());
    return () => this.statusListeners.delete(fn);
  }

  start() {
    if (this.timer) return;
    this.t = 0;
    this.drift = 0;
    this.timer = setInterval(() => this.tick(), 1000);
    this.statusListeners.forEach((f) => f(true));
  }

  stop() {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
    this.statusListeners.forEach((f) => f(false));
  }

  private tick() {
    this.t += 1;
    // Gentle, occasionally spiky synthetic signals
    const noise = (a: number) => (Math.random() - 0.5) * a;
    // After ~25s, slowly degrade
    if (this.t > 25) this.drift += 0.05;

    const ambientTemp = 28 + Math.sin(this.t / 30) * 1.5 + noise(0.4);
    const oilTemp =
      ambientTemp +
      6 +
      Math.sin(this.t / 12) * 1.2 +
      this.drift * 0.6 +
      noise(0.5);
    const flow = Math.max(
      0,
      3.6 - this.drift * 0.04 + Math.sin(this.t / 18) * 0.25 + noise(0.15),
    );
    const vibration = Math.max(
      0,
      0.06 + this.drift * 0.012 + Math.abs(Math.sin(this.t / 7)) * 0.05 + noise(0.04),
    );
    const tempDiff = oilTemp - ambientTemp;

    // Health index: weighted from each metric
    const flowScore = clamp01((flow - 1.5) / 2.5) * 100;
    const vibScore = clamp01(1 - vibration / 0.6) * 100;
    const diffScore = clamp01(1 - (tempDiff - 5) / 20) * 100;
    const healthIndex = Math.round(
      flowScore * 0.3 + vibScore * 0.4 + diffScore * 0.3,
    );

    const alerts: AlertCode[] = [];
    if (flow < THRESH.flowMin) alerts.push("LOW_FLOW");
    if (vibration > THRESH.vibrationMax) alerts.push("HIGH_VIBRATION");
    if (tempDiff > THRESH.tempDiffMax) alerts.push("HIGH_TEMP_DIFF");
    if (healthIndex < THRESH.healthMin) alerts.push("LOW_HEALTH");

    const vibState: MlState =
      vibration > 0.3 ? "CRITICAL" : vibration > 0.18 ? "WARNING" : "NORMAL";
    const tempState: MlState =
      tempDiff > 16 ? "CRITICAL" : tempDiff > 12 ? "WARNING" : "NORMAL";
    const failure = vibState === "CRITICAL" && tempState !== "NORMAL";
    if (failure) alerts.push("ML_FAILURE_PREDICTED");

    const payload: SensorPayload = {
      oilTemp: round(oilTemp, 2),
      ambientTemp: round(ambientTemp, 2),
      flow: round(flow, 2),
      vibration: round(vibration, 3),
      tempDiff: round(tempDiff, 2),
      healthIndex,
      alerts,
      mlPrediction: { vibration: vibState, temperature: tempState, failure },
      ts: Date.now(),
    };

    this.listeners.forEach((f) => f(payload));
  }
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}
function round(n: number, d: number) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

export const sim = new Sim();

export const ALERT_LABEL: Record<AlertCode, string> = {
  LOW_FLOW: "Low oil flow rate",
  HIGH_VIBRATION: "High vibration",
  HIGH_TEMP_DIFF: "High oil-ambient ΔT",
  LOW_HEALTH: "Health index low",
  ML_FAILURE_PREDICTED: "ML: failure imminent",
};

export const ALERT_SEVERITY: Record<AlertCode, "warning" | "critical"> = {
  LOW_FLOW: "warning",
  HIGH_VIBRATION: "warning",
  HIGH_TEMP_DIFF: "warning",
  LOW_HEALTH: "warning",
  ML_FAILURE_PREDICTED: "critical",
};

export { THRESH };
