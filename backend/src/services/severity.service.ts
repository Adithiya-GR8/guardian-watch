/**
 * Transense — Unified Severity Scoring
 * ==========================================
 * Combines ML anomaly score, rate-of-change, rolling std, persistence ratio,
 * and multi-time-scale trend acceleration into a single 0–1 severity metric.
 *
 * Weights (sum = 1.0):
 *   anomaly score  : 0.40  (primary ML signal)
 *   persistence    : 0.25  (temporal confidence)
 *   rate of change : 0.15  (directional urgency)
 *   rolling std    : 0.10  (instability indicator)
 *   trend accel    : 0.10  (multi-time-scale acceleration)
 */

export interface SeverityInput {
  anomalyScore: number;      // raw score from Python (negative = more anomalous)
  rateOfChange: number;      // current rate (°C/s or m/s²/s)
  rollingStd: number;        // window std dev
  persistenceRatio: number;  // fraction of recent anomalies (0–1)
  trendAcceleration: number; // shortRate - longRate (positive = worsening)
}

export type SeverityLevel = "NORMAL" | "WARNING" | "CRITICAL";

export interface SeverityResult {
  level: SeverityLevel;
  score: number;  // 0–1 (0 = perfectly normal, 1 = extreme anomaly)
}

// Thresholds for level classification
const WARN_THRESHOLD = 0.35;
const CRIT_THRESHOLD = 0.65;

class SeverityService {
  /**
   * Compute unified severity from multiple signal sources.
   * All inputs are normalized to [0, 1] before weighting.
   */
  public evaluate(input: SeverityInput): SeverityResult {
    // 1. Normalize anomaly score
    //    Python decision_function: positive = normal, negative = anomaly
    //    Typical range: -0.3 to +0.3 → map so that -0.2 → 1.0, +0.2 → 0.0
    const normAnomaly = clamp((0.15 - input.anomalyScore) / 0.35);

    // 2. Normalize rate of change (higher absolute rate = worse)
    //    Temp: normal ~0.05°C/s, concerning > 0.5°C/s
    //    Vib: similar scale
    const normRate = clamp(Math.abs(input.rateOfChange) / 1.5);

    // 3. Normalize rolling std (higher = more unstable)
    const normStd = clamp(input.rollingStd / 3.0);

    // 4. Persistence ratio is already 0–1
    const normPersistence = clamp(input.persistenceRatio);

    // 5. Normalize trend acceleration (positive = accelerating toward failure)
    const normTrend = clamp(Math.max(0, input.trendAcceleration) / 0.5);

    // Weighted combination
    const score =
      normAnomaly     * 0.40 +
      normPersistence * 0.25 +
      normRate        * 0.15 +
      normStd         * 0.10 +
      normTrend       * 0.10;

    const level: SeverityLevel =
      score >= CRIT_THRESHOLD ? "CRITICAL" :
      score >= WARN_THRESHOLD ? "WARNING"  :
      "NORMAL";

    return { level, score };
  }
}

function clamp(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export const severityService = new SeverityService();
