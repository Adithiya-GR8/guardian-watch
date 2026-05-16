// Production data layer - Connects to Node.js Backend
// This replaces the mock simulator with a real WebSocket connection.

export type MlState = "NORMAL" | "WARNING" | "FAILURE" | "MODEL_NOT_FOUND" | "SERVICE_DOWN";

export type SensorPayload = {
  status: "RUNNING" | "ERROR" | "STOPPED";
  machineConnected: boolean;
  mode: "HARDWARE" | "SIMULATOR" | "IDLE";
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
  message?: string;
};

export type AlertCode =
  | "LOW_FLOW"
  | "HIGH_FLOW"
  | "HIGH_VIBRATION"
  | "HIGH_TEMP_DIFF"
  | "LOW_HEALTH"
  | "CRITICAL_TEMPERATURE"
  | "ML_FAILURE_PREDICTED";

type Listener = (p: SensorPayload) => void;

const THRESH = {
  flowMin: 1.6,
  flowMax: 2.1,
  vibrationWatch: 8.5,
  vibrationMax: 10.0,
  oilTempWatch: 42.0,
  oilTempMax: 45.0,
  tempDiffMax: 8.0,
  healthMin: 60,
};

class SocketManager {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<(running: boolean) => void>();
  private isRunning = false;
  private isOffline = true;
  private backendUrl = "ws://localhost:3001";
  private serverStatusListeners = new Set<(offline: boolean) => void>();

  constructor() {
    this.connect();
    this.checkApi();
  }

  private async checkApi() {
    try {
      const res = await fetch("http://localhost:3001/api/status");
      if (res.ok) {
        this.isOffline = false;
        this.serverStatusListeners.forEach(f => f(false));
      }
    } catch (e) {
      this.isOffline = true;
      this.serverStatusListeners.forEach(f => f(true));
    }
    setTimeout(() => this.checkApi(), 5000);
  }

  private connect() {
    try {
      this.ws = new WebSocket(this.backendUrl);

      this.ws.onmessage = (event) => {
        const data = JSON.parse(event.data) as SensorPayload;
        
        // Update operational status
        const running = data.status === "RUNNING";
        if (this.isRunning !== running) {
          this.isRunning = running;
          this.statusListeners.forEach(f => f(running));
        }

        this.listeners.forEach(f => f(data));
      };

      this.ws.onclose = () => {
        console.warn("Backend WebSocket closed. Retrying...");
        setTimeout(() => this.connect(), 2000);
      };

      this.ws.onerror = () => {
        this.statusListeners.forEach(f => f(false));
      };
    } catch (e) {
      console.error("Socket connection failed:", e);
    }
  }

  onData(fn: Listener) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  onStatus(fn: (running: boolean) => void) {
    this.statusListeners.add(fn);
    fn(this.isRunning);
    return () => this.statusListeners.delete(fn);
  }

  onServerStatus(fn: (offline: boolean) => void) {
    this.serverStatusListeners.add(fn);
    fn(this.isOffline);
    return () => this.serverStatusListeners.delete(fn);
  }

  async start() {
    try {
      await fetch("http://localhost:3001/api/start", { method: "POST" });
    } catch (e) {
      console.error("Failed to start backend:", e);
    }
  }

  async stop() {
    try {
      await fetch("http://localhost:3001/api/stop", { method: "POST" });
    } catch (e) {
      console.error("Failed to stop backend:", e);
    }
  }
}

export const sim = new SocketManager();

export const ALERT_LABEL: Record<AlertCode, string> = {
  LOW_FLOW: "Flow below 1.6 L/min",
  HIGH_FLOW: "Flow above 2.1 L/min",
  HIGH_VIBRATION: "Vibration exceeds 10 m/s\u00B2",
  HIGH_TEMP_DIFF: "Oil-Atmos \u0394T exceeds 8\u00B0C",
  LOW_HEALTH: "Health index below 60",
  CRITICAL_TEMPERATURE: "Oil temp exceeds 45\u00B0C",
  ML_FAILURE_PREDICTED: "ML: failure predicted",
};

export const ALERT_SEVERITY: Record<AlertCode, "warning" | "critical"> = {
  LOW_FLOW: "warning",
  HIGH_FLOW: "warning",
  HIGH_VIBRATION: "critical",
  HIGH_TEMP_DIFF: "warning",
  LOW_HEALTH: "warning",
  CRITICAL_TEMPERATURE: "critical",
  ML_FAILURE_PREDICTED: "critical",
};

export { THRESH };

