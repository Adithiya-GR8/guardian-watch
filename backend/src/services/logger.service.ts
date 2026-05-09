import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get current directory in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LoggerService {
  private logFilePath: string;
  private isInitialized: boolean = false;

  constructor() {
    // Root directory is two levels up from src/services
    const rootDir = path.join(__dirname, "..", "..", "..");
    const logsDir = path.join(rootDir, "logs");

    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.logFilePath = path.join(logsDir, `telemetry_${timestamp}.csv`);
  }

  private initFile() {
    const headers = [
      "Timestamp",
      "Mode",
      "Oil_Temp_C",
      "Vibration_g",
      "Flow_Lmin",
      "Ambient_Temp_C",
      "Health_Index",
      "ML_Vib_Status",
      "ML_Temp_Status",
      "ML_Failure_Risk"
    ].join(",");

    fs.writeFileSync(this.logFilePath, headers + "\n");
    this.isInitialized = true;
    console.log(`[LOGGER] Started new session log: ${path.basename(this.logFilePath)}`);
  }

  public log(data: any) {
    if (!this.isInitialized) {
      this.initFile();
    }

    const row = [
      new Date(data.ts).toLocaleString(),
      data.mode,
      data.oilTemp,
      data.vibration,
      data.flow,
      data.ambientTemp,
      data.healthIndex,
      data.mlPrediction.vibration,
      data.mlPrediction.temperature,
      data.mlPrediction.failure ? "YES" : "NO"
    ].join(",");

    fs.appendFileSync(this.logFilePath, row + "\n");
  }
}

export const loggerService = new LoggerService();
