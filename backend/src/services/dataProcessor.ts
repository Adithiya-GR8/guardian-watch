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
    
    // 1. Calculate temperature difference
    const tempDiff = data.oilTemp - ambientTemp;
    if (tempDiff > THRESHOLDS.tempDiffMax) {
      alerts.push("HIGH_TEMP_DIFF");
    }

    // 2. Rule-based alerts
    if (data.flow < THRESHOLDS.flowMin) {
      alerts.push("LOW_FLOW");
    }
    if (data.vibration > THRESHOLDS.vibrationMax) {
      alerts.push("HIGH_VIBRATION");
    }
    if (data.oilTemp > THRESHOLDS.oilTempMax) {
      alerts.push("CRITICAL_TEMPERATURE");
    }

    // 3. Cumulative Health Index Calculation (0-100)
    // We calculate "penalty" points for each sensor
    let penalty = 0;

    // Flow penalty (Up to 30 points)
    // Optimal is > 3.5. Lower than 2.5 is failing.
    if (data.flow < 3.5) {
      penalty += Math.min(30, (3.5 - data.flow) * 30);
    }

    // Vibration penalty (Up to 35 points)
    // Optimal is < 0.05. Above 0.2 is critical.
    if (data.vibration > 0.05) {
      penalty += Math.min(35, ((data.vibration - 0.05) / 0.15) * 35);
    }

    // Temperature penalty (Up to 35 points)
    // Optimal oil temp is < 50. Above 65 is critical.
    if (data.oilTemp > 50) {
      penalty += Math.min(35, ((data.oilTemp - 50) / 15) * 35);
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
