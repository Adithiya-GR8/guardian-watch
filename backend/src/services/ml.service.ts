import axios from "axios";
import { ML_CONFIG } from "../config/thresholds.js";

export type MlPredictionState = "NORMAL" | "WARNING" | "FAILURE" | "MODEL_NOT_FOUND" | "SERVICE_DOWN";

export interface MlPredictionResult {
  vibration: MlPredictionState;
  temperature: MlPredictionState;
  failure: boolean;
}

class MlService {
  private tempBuffer: number[] = [];
  private vibBuffer: number[] = [];
  private lastTs: number = Date.now();
  private lastRateOfChange: number = 0;
  private lastOilTemp: number | null = null;

  private readonly TEMP_WINDOW = 5;
  private readonly VIB_WINDOW = 50;

  public async getVibrationPrediction(value: number): Promise<MlPredictionState> {
    this.vibBuffer.push(value);
    if (this.vibBuffer.length > this.VIB_WINDOW) {
      this.vibBuffer.shift();
    }

    if (this.vibBuffer.length < this.VIB_WINDOW) {
      return "NORMAL"; // Need more data
    }

    try {
      // The Python API expects raw samples and calculates features internally
      // console.log(`Calling Vibration ML with ${this.vibBuffer.length} samples...`);
      const response = await axios.post(`${ML_CONFIG.baseUrl}/predict/vibration`, { 
        samples: this.vibBuffer 
      }, { timeout: 1000 });
      
      if (response.data.status !== "NORMAL") {
        console.log(`ML Prediction: Vibration ${response.data.status} (MAE: ${response.data.value})`);
      }
      
      return response.data.status;
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
        return "SERVICE_DOWN";
      }
      return "MODEL_NOT_FOUND";
    }
  }

  public async getTemperaturePrediction(value: number): Promise<MlPredictionState> {
    const now = Date.now();
    const timeDiffMin = (now - this.lastTs) / (1000 * 60);
    
    this.tempBuffer.push(value);
    if (this.tempBuffer.length > this.TEMP_WINDOW) {
      this.tempBuffer.shift();
    }

    if (this.tempBuffer.length < this.TEMP_WINDOW || this.lastOilTemp === null) {
      this.lastOilTemp = value;
      this.lastTs = now;
      return "NORMAL"; // Need more data
    }

    try {
      // Calculate features: [OT, rolling_mean, rate_of_change, rolling_std, acceleration]
      const sum = this.tempBuffer.reduce((a, b) => a + b, 0);
      const rollingMean = sum / this.tempBuffer.length;
      
      const variance = this.tempBuffer.reduce((a, b) => a + Math.pow(b - rollingMean, 2), 0) / this.tempBuffer.length;
      const rollingStd = Math.sqrt(variance);
      
      // Use a floor for timeDiff to avoid division by zero or extreme spikes (min 1 sec equivalent in mins)
      const effectiveTimeDiff = Math.max(timeDiffMin, 0.01); 
      const rateOfChange = (value - this.lastOilTemp) / effectiveTimeDiff;
      const acceleration = (rateOfChange - this.lastRateOfChange) / effectiveTimeDiff;

      const features = [value, rollingMean, rateOfChange, rollingStd, acceleration];

      this.lastRateOfChange = rateOfChange;
      this.lastOilTemp = value;
      this.lastTs = now;

      const response = await axios.post(`${ML_CONFIG.baseUrl}/predict/temperature`, { 
        features 
      }, { timeout: 1000 });
      
      return response.data.status;
    } catch (error) {
      if (axios.isAxiosError(error) && error.code === "ECONNREFUSED") {
        return "SERVICE_DOWN";
      }
      return "MODEL_NOT_FOUND";
    }
  }

  public async getPredictions(vibration: number, temperature: number): Promise<MlPredictionResult> {
    const [vibPred, tempPred] = await Promise.all([
      this.getVibrationPrediction(vibration),
      this.getTemperaturePrediction(temperature)
    ]);

    // Failure if either is FAILURE or if we have multiple WARNINGS
    const failure = (vibPred === "FAILURE" || tempPred === "FAILURE" || (vibPred === "WARNING" && tempPred === "WARNING"));

    return {
      vibration: vibPred,
      temperature: tempPred,
      failure
    };
  }
}

export const mlService = new MlService();
