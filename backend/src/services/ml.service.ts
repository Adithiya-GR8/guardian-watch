import axios from "axios";
import { ML_CONFIG } from "../config/thresholds.js";

/**
 * Guardian Watch — ML Service Client
 * ===================================
 * Computes temporal features from sensor buffers, sends them to the
 * Python FastAPI service, and applies persistence filtering to suppress
 * transient noise and startup instability.
 *
 * Architecture:
 *   Node.js (features + persistence) → Python (stateless model) → Node.js (final state)
 *
 * Feature Match Contract:
 *   Temperature: [oil_temp, rate_of_change, rolling_mean, rolling_std]
 *   Vibration:   [vibration, rate_of_change, rolling_mean, rms, rolling_std]
 *   Window: 10 samples, std uses sample variance (ddof=1) to match pandas default
 */

export type MlPredictionState = "NORMAL" | "WARNING" | "MODEL_NOT_FOUND" | "SERVICE_DOWN";

export interface MlPredictionResult {
  vibration: MlPredictionState;
  temperature: MlPredictionState;
  failure: boolean;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Rolling window size — must match the training pipeline (models/utils.py WINDOW) */
const WINDOW = 10;

/** Persistence buffer length — how many recent predictions to track */
const PERSISTENCE_SIZE = 5;

/** Minimum anomaly count within the persistence buffer to trigger WARNING */
const PERSISTENCE_THRESHOLD = 3;

// =============================================================================
// ML SERVICE
// =============================================================================

class MlService {
  // --- Temperature state ---
  private tempBuffer: number[] = [];
  private lastOilTemp: number | null = null;
  private tempLastTs: number = Date.now();
  private tempPersistence: boolean[] = [];

  // --- Vibration state ---
  private vibBuffer: number[] = [];
  private lastVibration: number | null = null;
  private vibLastTs: number = Date.now();
  private vibPersistence: boolean[] = [];

  // =========================================================================
  // TEMPERATURE PREDICTION
  // =========================================================================

  public async getTemperaturePrediction(value: number): Promise<MlPredictionState> {
    const now = Date.now();
    const elapsedSeconds = Math.max((now - this.tempLastTs) / 1000, 0.1);

    // Push to sliding window
    this.tempBuffer.push(value);
    if (this.tempBuffer.length > WINDOW) {
      this.tempBuffer.shift();
    }

    // Warm-up: return NORMAL until we have a full window + a previous value
    if (this.tempBuffer.length < WINDOW || this.lastOilTemp === null) {
      this.lastOilTemp = value;
      this.tempLastTs = now;
      return "NORMAL";
    }

    // --- Compute 4 features (must match training exactly) ---
    const rateOfChange = (value - this.lastOilTemp) / elapsedSeconds;
    const rollingMean = mean(this.tempBuffer);
    const rollingStd = sampleStd(this.tempBuffer);

    const features = [value, rateOfChange, rollingMean, rollingStd];

    // Update state for next call
    this.lastOilTemp = value;
    this.tempLastTs = now;

    // --- Call Python ML service ---
    try {
      const response = await axios.post(
        `${ML_CONFIG.baseUrl}/predict/temperature`,
        { features },
        { timeout: 1000 }
      );

      const isAnomaly = response.data.status === "ANOMALY";

      // --- Persistence filter ---
      return this.applyPersistence(
        this.tempPersistence,
        isAnomaly,
        "Temp",
        response.data.score
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
        return "SERVICE_DOWN";
      }
      return "MODEL_NOT_FOUND";
    }
  }

  // =========================================================================
  // VIBRATION PREDICTION
  // =========================================================================

  public async getVibrationPrediction(value: number): Promise<MlPredictionState> {
    const now = Date.now();
    const elapsedSeconds = Math.max((now - this.vibLastTs) / 1000, 0.1);

    // Push to sliding window
    this.vibBuffer.push(value);
    if (this.vibBuffer.length > WINDOW) {
      this.vibBuffer.shift();
    }

    // Warm-up: return NORMAL until we have a full window + a previous value
    if (this.vibBuffer.length < WINDOW || this.lastVibration === null) {
      this.lastVibration = value;
      this.vibLastTs = now;
      return "NORMAL";
    }

    // --- Compute 5 features (must match training exactly) ---
    const rateOfChange = (value - this.lastVibration) / elapsedSeconds;
    const rollingMean = mean(this.vibBuffer);
    const rms = rootMeanSquare(this.vibBuffer);
    const rollingStd = sampleStd(this.vibBuffer);

    const features = [value, rateOfChange, rollingMean, rms, rollingStd];

    // Update state for next call
    this.lastVibration = value;
    this.vibLastTs = now;

    // --- Call Python ML service ---
    try {
      const response = await axios.post(
        `${ML_CONFIG.baseUrl}/predict/vibration`,
        { features },
        { timeout: 1000 }
      );

      const isAnomaly = response.data.status === "ANOMALY";

      // --- Persistence filter ---
      return this.applyPersistence(
        this.vibPersistence,
        isAnomaly,
        "Vib",
        response.data.score
      );
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
        return "SERVICE_DOWN";
      }
      return "MODEL_NOT_FOUND";
    }
  }

  // =========================================================================
  // COMBINED PREDICTION (called by the orchestrator in index.ts)
  // =========================================================================

  public async getPredictions(vibration: number, temperature: number): Promise<MlPredictionResult> {
    const [vibPred, tempPred] = await Promise.all([
      this.getVibrationPrediction(vibration),
      this.getTemperaturePrediction(temperature),
    ]);

    // Failure flag: true only when BOTH models signal WARNING simultaneously
    const failure = vibPred === "WARNING" && tempPred === "WARNING";

    return {
      vibration: vibPred,
      temperature: tempPred,
      failure,
    };
  }

  // =========================================================================
  // PERSISTENCE FILTER (private)
  // =========================================================================

  /**
   * Applies temporal persistence filtering to suppress transient noise.
   *
   * Logic: Push each raw anomaly flag into a sliding buffer of the last
   * PERSISTENCE_SIZE predictions. Only output WARNING if at least
   * PERSISTENCE_THRESHOLD of them are anomalies.
   *
   * This ensures that 1-2 isolated spikes, startup transients, or momentary
   * sensor noise do NOT trigger a warning — only sustained behavioral
   * changes do.
   */
  private applyPersistence(
    buffer: boolean[],
    isAnomaly: boolean,
    label: string,
    score: number
  ): MlPredictionState {
    buffer.push(isAnomaly);
    if (buffer.length > PERSISTENCE_SIZE) {
      buffer.shift();
    }

    const anomalyCount = buffer.filter((v) => v).length;
    const state: MlPredictionState =
      anomalyCount >= PERSISTENCE_THRESHOLD ? "WARNING" : "NORMAL";

    if (state === "WARNING") {
      console.log(
        `ML ${label} WARNING (${anomalyCount}/${PERSISTENCE_SIZE} anomalies, score: ${score.toFixed(4)})`
      );
    }

    return state;
  }
}

// =============================================================================
// MATH HELPERS (match pandas rolling behavior exactly)
// =============================================================================

/** Arithmetic mean of an array. */
function mean(arr: number[]): number {
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

/**
 * Sample standard deviation (ddof=1).
 * Matches pandas .rolling().std() default behavior.
 * Uses (N-1) denominator, NOT population std (N).
 */
function sampleStd(arr: number[]): number {
  const m = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

/** Root-mean-square of an array. Uses population mean (N denominator). */
function rootMeanSquare(arr: number[]): number {
  return Math.sqrt(arr.reduce((s, v) => s + v * v, 0) / arr.length);
}

// =============================================================================
// SINGLETON EXPORT
// =============================================================================

export const mlService = new MlService();
