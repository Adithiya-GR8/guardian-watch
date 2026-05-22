import axios from "axios";
import { ML_CONFIG } from "../config/thresholds.js";
import { severityService, type SeverityInput, type SeverityResult } from "./severity.service.js";

/**
 * Transense — ML Service Client (Enhanced)
 * ===============================================
 * Enhancements over v1:
 *   1. Multi-time-scale rate analysis (short 5 vs long 20 windows)
 *   2. Improved persistence: consecutive counting + hold timer + recovery gate
 *   3. Startup stabilization: extended warm-up if readings are unstable
 *   4. Unified severity scoring integration
 *   5. Exposes detailed scores for health index enhancement
 *
 * Architecture unchanged: Node.js (features) → Python (stateless model) → Node.js (decision)
 *
 * Feature Contract (MUST match training pipeline exactly):
 *   Temperature: [oil_temp, rate_of_change, rolling_mean, rolling_std]
 *   Vibration:   [vibration, rate_of_change, rolling_mean, rms, rolling_std]
 */

export type MlPredictionState = "NORMAL" | "WARNING" | "MODEL_NOT_FOUND" | "SERVICE_DOWN";

export interface MlPredictionResult {
  vibration: MlPredictionState;
  temperature: MlPredictionState;
  failure: boolean;
  /** Detailed scores for health index integration and dashboard enrichment */
  details: {
    tempAnomalyScore: number;
    vibAnomalyScore: number;
    tempSeverity: SeverityResult;
    vibSeverity: SeverityResult;
    tempTrendAccel: number;
    vibTrendAccel: number;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Rolling window for feature engineering — must match training (models/utils.py) */
const WINDOW = 10;

/** Short-term trend window for multi-time-scale analysis */
const SHORT_TREND_WINDOW = 5;

/** Long-term trend window for multi-time-scale analysis */
const LONG_TREND_WINDOW = 20;

/** Minimum readings before ML inference starts (basic warm-up) */
const MIN_WARMUP = 10;

/** Maximum extended warm-up if readings are unstable */
const MAX_WARMUP = 25;

/** Startup stability threshold — std dev must be below this to start inference */
const TEMP_STABILITY_STD = 5.0;   // °C
const VIB_STABILITY_STD = 4.0;    // m/s²

// --- Persistence constants ---

/** Consecutive anomalies required to enter WARNING */
const CONSECUTIVE_TO_WARN = 3;

/** Consecutive normals required to exit WARNING (after hold expires) */
const CONSECUTIVE_TO_RECOVER = 5;

/** Minimum hold duration (ms) once WARNING is triggered */
const WARNING_HOLD_MS = 8000;

// =============================================================================
// PER-SENSOR STATE
// =============================================================================

interface SensorState {
  // Feature engineering
  buffer: number[];               // sliding window (WINDOW size)
  lastValue: number | null;
  lastTs: number;

  // Multi-time-scale rate history
  rateHistory: number[];          // stores computed rates for trend analysis

  // Improved persistence
  consecutiveAnomalies: number;
  consecutiveNormals: number;
  warningHoldUntil: number;       // timestamp — WARNING cannot clear before this
  currentState: MlPredictionState;

  // Scores (for external consumption)
  lastAnomalyScore: number;
  lastSeverity: SeverityResult;

  // Startup stabilization
  readingCount: number;
  stabilized: boolean;
}

function createSensorState(): SensorState {
  return {
    buffer: [],
    lastValue: null,
    lastTs: Date.now(),
    rateHistory: [],
    consecutiveAnomalies: 0,
    consecutiveNormals: 0,
    warningHoldUntil: 0,
    currentState: "NORMAL",
    lastAnomalyScore: 0,
    lastSeverity: { level: "NORMAL", score: 0 },
    readingCount: 0,
    stabilized: false,
  };
}

// =============================================================================
// ML SERVICE
// =============================================================================

class MlService {
  private temp: SensorState = createSensorState();
  private vib: SensorState = createSensorState();

  // =========================================================================
  // TEMPERATURE PREDICTION
  // =========================================================================

  public async getTemperaturePrediction(value: number): Promise<MlPredictionState> {
    const s = this.temp;
    const now = Date.now();
    const elapsed = Math.max((now - s.lastTs) / 1000, 0.1);
    s.readingCount++;

    // Push to sliding window
    s.buffer.push(value);
    if (s.buffer.length > WINDOW) s.buffer.shift();

    // --- Startup stabilization ---
    if (!s.stabilized) {
      s.stabilized = this.checkStability(s, TEMP_STABILITY_STD);
      if (!s.stabilized) {
        s.lastValue = value;
        s.lastTs = now;
        return "NORMAL";
      }
    }

    // Need full window + previous value
    if (s.buffer.length < WINDOW || s.lastValue === null) {
      s.lastValue = value;
      s.lastTs = now;
      return "NORMAL";
    }

    // --- Compute 4 features (MUST match training exactly) ---
    const rateOfChange = (value - s.lastValue) / elapsed;
    const rollingMean = mean(s.buffer);
    const rollingStd = sampleStd(s.buffer);
    const features = [value, rateOfChange, rollingMean, rollingStd];

    // --- Multi-time-scale rate tracking ---
    s.rateHistory.push(rateOfChange);
    if (s.rateHistory.length > LONG_TREND_WINDOW) s.rateHistory.shift();
    const trendAccel = this.computeTrendAcceleration(s.rateHistory);

    // Update state
    s.lastValue = value;
    s.lastTs = now;

    // --- Call Python ML service ---
    try {
      const resp = await axios.post(
        `${ML_CONFIG.baseUrl}/predict/temperature`,
        { features },
        { timeout: 1000 }
      );

      const isAnomaly = resp.data.status === "ANOMALY";
      const score: number = resp.data.score ?? 0;
      s.lastAnomalyScore = score;

      // --- Severity scoring ---
      const sevInput: SeverityInput = {
        anomalyScore: score,
        rateOfChange,
        rollingStd,
        persistenceRatio: this.getPersistenceRatio(s),
        trendAcceleration: trendAccel,
      };
      s.lastSeverity = severityService.evaluate(sevInput);

      // --- Improved persistence ---
      return this.applyPersistence(s, isAnomaly, "Temp", score);

    } catch (error) {
      return axios.isAxiosError(error) && error.code === "ECONNREFUSED"
        ? "SERVICE_DOWN" : "MODEL_NOT_FOUND";
    }
  }

  // =========================================================================
  // VIBRATION PREDICTION
  // =========================================================================

  public async getVibrationPrediction(value: number): Promise<MlPredictionState> {
    const s = this.vib;
    const now = Date.now();
    const elapsed = Math.max((now - s.lastTs) / 1000, 0.1);
    s.readingCount++;

    s.buffer.push(value);
    if (s.buffer.length > WINDOW) s.buffer.shift();

    // --- Startup stabilization ---
    if (!s.stabilized) {
      s.stabilized = this.checkStability(s, VIB_STABILITY_STD);
      if (!s.stabilized) {
        s.lastValue = value;
        s.lastTs = now;
        return "NORMAL";
      }
    }

    if (s.buffer.length < WINDOW || s.lastValue === null) {
      s.lastValue = value;
      s.lastTs = now;
      return "NORMAL";
    }

    // --- Compute 5 features (MUST match training exactly) ---
    const rateOfChange = (value - s.lastValue) / elapsed;
    const rollingMean = mean(s.buffer);
    const rms = rootMeanSquare(s.buffer);
    const rollingStd = sampleStd(s.buffer);
    const features = [value, rateOfChange, rollingMean, rms, rollingStd];

    // --- Multi-time-scale rate tracking ---
    s.rateHistory.push(rateOfChange);
    if (s.rateHistory.length > LONG_TREND_WINDOW) s.rateHistory.shift();
    const trendAccel = this.computeTrendAcceleration(s.rateHistory);

    s.lastValue = value;
    s.lastTs = now;

    try {
      const resp = await axios.post(
        `${ML_CONFIG.baseUrl}/predict/vibration`,
        { features },
        { timeout: 1000 }
      );

      const isAnomaly = resp.data.status === "ANOMALY";
      const score: number = resp.data.score ?? 0;
      s.lastAnomalyScore = score;

      const sevInput: SeverityInput = {
        anomalyScore: score,
        rateOfChange,
        rollingStd,
        persistenceRatio: this.getPersistenceRatio(s),
        trendAcceleration: trendAccel,
      };
      s.lastSeverity = severityService.evaluate(sevInput);

      return this.applyPersistence(s, isAnomaly, "Vib", score);

    } catch (error) {
      return axios.isAxiosError(error) && error.code === "ECONNREFUSED"
        ? "SERVICE_DOWN" : "MODEL_NOT_FOUND";
    }
  }

  // =========================================================================
  // COMBINED PREDICTION
  // =========================================================================

  public async getPredictions(vibration: number, temperature: number): Promise<MlPredictionResult> {
    const [vibPred, tempPred] = await Promise.all([
      this.getVibrationPrediction(vibration),
      this.getTemperaturePrediction(temperature),
    ]);

    const failure = vibPred === "WARNING" && tempPred === "WARNING";

    return {
      vibration: vibPred,
      temperature: tempPred,
      failure,
      details: {
        tempAnomalyScore: this.temp.lastAnomalyScore,
        vibAnomalyScore: this.vib.lastAnomalyScore,
        tempSeverity: { ...this.temp.lastSeverity },
        vibSeverity: { ...this.vib.lastSeverity },
        tempTrendAccel: this.computeTrendAcceleration(this.temp.rateHistory),
        vibTrendAccel: this.computeTrendAcceleration(this.vib.rateHistory),
      },
    };
  }

  // =========================================================================
  // MULTI-TIME-SCALE TREND ANALYSIS
  // =========================================================================

  /**
   * Computes trend acceleration: shortRate - longRate.
   * Positive value = short-term rate is faster than long-term → accelerating degradation.
   * Negative value = short-term rate is slower → stabilizing or recovering.
   */
  private computeTrendAcceleration(rateHistory: number[]): number {
    if (rateHistory.length < SHORT_TREND_WINDOW) return 0;

    const shortRates = rateHistory.slice(-SHORT_TREND_WINDOW);
    const longRates = rateHistory.slice(-Math.min(LONG_TREND_WINDOW, rateHistory.length));

    return mean(shortRates) - mean(longRates);
  }

  // =========================================================================
  // IMPROVED PERSISTENCE FILTER
  // =========================================================================

  /**
   * Enhanced persistence with 3 mechanisms:
   *   1. Consecutive counting: WARNING only after CONSECUTIVE_TO_WARN anomalies in a row
   *   2. Warning hold: once WARNING triggers, it holds for WARNING_HOLD_MS minimum
   *   3. Recovery gate: clearing WARNING requires CONSECUTIVE_TO_RECOVER normals
   *      AND the hold timer must have expired
   */
  private applyPersistence(
    s: SensorState,
    isAnomaly: boolean,
    label: string,
    score: number
  ): MlPredictionState {
    const now = Date.now();

    if (isAnomaly) {
      s.consecutiveAnomalies++;
      s.consecutiveNormals = 0;
    } else {
      s.consecutiveNormals++;
      s.consecutiveAnomalies = 0;
    }

    // --- State transitions ---
    if (s.currentState === "NORMAL") {
      // NORMAL → WARNING: need N consecutive anomalies
      if (s.consecutiveAnomalies >= CONSECUTIVE_TO_WARN) {
        s.currentState = "WARNING";
        s.warningHoldUntil = now + WARNING_HOLD_MS;
        console.log(
          `ML ${label} WARNING (${s.consecutiveAnomalies} consecutive, score: ${score.toFixed(4)}, ` +
          `severity: ${s.lastSeverity.score.toFixed(3)})`
        );
      }
    } else {
      // WARNING → NORMAL: need hold expired + M consecutive normals
      const holdExpired = now >= s.warningHoldUntil;
      if (holdExpired && s.consecutiveNormals >= CONSECUTIVE_TO_RECOVER) {
        s.currentState = "NORMAL";
        console.log(`ML ${label} RECOVERED (${s.consecutiveNormals} consecutive normals)`);
      } else if (s.currentState === "WARNING" && isAnomaly) {
        // Sustaining warning — extend hold timer
        s.warningHoldUntil = Math.max(s.warningHoldUntil, now + WARNING_HOLD_MS / 2);
      }
    }

    return s.currentState;
  }

  /** Get current persistence ratio for severity scoring (0–1) */
  private getPersistenceRatio(s: SensorState): number {
    if (s.currentState === "WARNING") {
      // During warning, ratio is based on how deep into the anomaly we are
      return Math.min(1, s.consecutiveAnomalies / (CONSECUTIVE_TO_WARN * 2));
    }
    return s.consecutiveAnomalies / (CONSECUTIVE_TO_WARN + 2);
  }

  // =========================================================================
  // STARTUP STABILIZATION
  // =========================================================================

  /**
   * Checks if sensor readings have stabilized enough to begin ML inference.
   * Returns true when:
   *   - At least MIN_WARMUP readings collected
   *   - Rolling std is below the stability threshold
   * Forces stabilization after MAX_WARMUP readings regardless.
   */
  private checkStability(s: SensorState, maxStd: number): boolean {
    // Force stabilize after max warmup
    if (s.readingCount >= MAX_WARMUP) {
      if (!s.stabilized) console.log(`[STARTUP] Forced stabilization after ${MAX_WARMUP} readings`);
      return true;
    }
    // Not enough readings yet
    if (s.buffer.length < MIN_WARMUP) return false;

    // Check if std is below threshold
    const std = sampleStd(s.buffer);
    const stable = std < maxStd;
    if (stable && !s.stabilized) {
      console.log(`[STARTUP] Sensor stabilized at reading ${s.readingCount} (std=${std.toFixed(3)})`);
    }
    return stable;
  }
}

// =============================================================================
// MATH HELPERS (match pandas rolling behavior exactly)
// =============================================================================

function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/** Sample standard deviation (ddof=1) — matches pandas .rolling().std() */
function sampleStd(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/** Root-mean-square — population (N denominator) */
function rootMeanSquare(arr: number[]): number {
  return Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const mlService = new MlService();
