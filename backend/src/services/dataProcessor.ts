import { THRESHOLDS } from "../config/thresholds.js";
import { SerialData } from "./serial.service.js";

export interface ProcessedData extends SerialData {
  ambientTemp: number;
  tempDiff: number;
  healthIndex: number;
  alerts: string[];
}

class DataProcessor {
  private lastProcessed: ProcessedData | null = null;

  public process(data: SerialData): ProcessedData {
    const alerts: string[] = [];
    
    // Use real sensor ambient temp if provided, otherwise fallback to simulation
    const ambientTemp = data.ambientTemp !== undefined 
      ? data.ambientTemp 
      : 25.0 + Math.sin(Date.now() / 100000) * 5; 
    
    // 1. Calculate temperature difference (Oil − Atmospheric)
    const tempDiff = data.oilTemp - ambientTemp;
    if (tempDiff > THRESHOLDS.tempDiffMax) {
      alerts.push("HIGH_TEMP_DIFF");
    }

    // 2. Rule-based alerts
    // Flow: normal range is 1.6–2.1 L/min
    if (data.flow < THRESHOLDS.flowMin) {
      alerts.push("LOW_FLOW");
    }
    if (data.flow > THRESHOLDS.flowMax) {
      alerts.push("HIGH_FLOW");
    }

    // Vibration: watch at 8.5, critical at 10.0 m/s²
    if (data.vibration > THRESHOLDS.vibrationMax) {
      alerts.push("HIGH_VIBRATION");
    }

    // Oil temperature: watch at 42, critical at 45°C
    if (data.oilTemp > THRESHOLDS.oilTempMax) {
      alerts.push("CRITICAL_TEMPERATURE");
    }

    // 3. Cumulative Health Index Calculation (0-100)
    // Penalties are calibrated to the actual OFAF operating ranges.
    let penalty = 0;

    // Flow penalty (Up to 30 points)
    // Normal range is 1.6–2.1 L/min. Below 1.6 is failing.
    if (data.flow < THRESHOLDS.flowMin) {
      // Scale: 1.6 → 0 penalty, 0.0 → 30 penalty
      penalty += Math.min(30, ((THRESHOLDS.flowMin - data.flow) / THRESHOLDS.flowMin) * 30);
    }

    // Vibration penalty (Up to 35 points)
    // Watch at 8.5, critical at 10.0 m/s²
    if (data.vibration > THRESHOLDS.vibrationWatch) {
      // Scale: 8.5 → 0 penalty, 10.0+ → 35 penalty
      const vibRange = THRESHOLDS.vibrationMax - THRESHOLDS.vibrationWatch;
      penalty += Math.min(35, ((data.vibration - THRESHOLDS.vibrationWatch) / vibRange) * 35);
    }

    // Temperature penalty (Up to 35 points)
    // Watch at 42, critical at 45°C
    if (data.oilTemp > THRESHOLDS.oilTempWatch) {
      // Scale: 42 → 0 penalty, 45+ → 35 penalty
      const tempRange = THRESHOLDS.oilTempMax - THRESHOLDS.oilTempWatch;
      penalty += Math.min(35, ((data.oilTemp - THRESHOLDS.oilTempWatch) / tempRange) * 35);
    }

    const healthIndex = Math.max(0, Math.round(100 - penalty));

    if (healthIndex < THRESHOLDS.healthLow) {
      alerts.push("LOW_HEALTH");
    }


    const processed: ProcessedData = {
      ...data,
      ambientTemp: parseFloat(ambientTemp.toFixed(2)),
      tempDiff: parseFloat(tempDiff.toFixed(2)),
      healthIndex,
      alerts
    };

    this.lastProcessed = processed;
    return processed;
  }

  private clamp01(n: number) {
    return Math.max(0, Math.min(1, n));
  }
}

export const dataProcessor = new DataProcessor();
