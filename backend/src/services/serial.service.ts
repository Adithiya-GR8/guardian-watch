import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { SERIAL_CONFIG } from "../config/thresholds.js";
import { EventEmitter } from "events";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SerialData {
  flow: number;
  oilTemp: number;
  vibration: number;
  ambientTemp?: number;
  raw: string;
}

class SerialService extends EventEmitter {
  private port: SerialPort | null = null;
  private parser: ReadlineParser | null = null;
  private isConnected = false;
  private running = false;
  private simulateInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
  }

  public async connect(): Promise<void> {
    if (this.running) return;
    this.running = true;

    console.log(`Attempting to connect to Arduino on ${SERIAL_CONFIG.port}...`);

    try {
      this.port = new SerialPort({
        path: SERIAL_CONFIG.port,
        baudRate: SERIAL_CONFIG.baudRate,
        autoOpen: false,
      });

      this.port.open((err) => {
        if (err) {
          console.warn(`Could not open ${SERIAL_CONFIG.port}: ${err.message}. Switching to SIMULATOR mode.`);
          this.startSimulator();
          return;
        }
        
        console.log("Serial port opened successfully ✅");
        this.isConnected = true;
        this.emit("connection", true);
        
        this.parser = this.port!.pipe(new ReadlineParser({ delimiter: "\r\n" }));
        this.parser.on("data", (data: string) => {
          this.parseData(data);
        });
      });

      this.port.on("close", () => {
        console.warn("Serial port closed.");
        this.handleDisconnect();
      });

      this.port.on("error", (err) => {
        // Only log error if we weren't expecting it (already in simulator)
        if (this.isConnected) {
            console.error("Serial port error: ", err.message);
            this.handleDisconnect();
        }
      });

    } catch (error) {
      console.warn("Failed to initialize serial port. Switching to SIMULATOR mode.");
      this.startSimulator();
    }
  }

  private simulatorFiles = ["data4.csv", "data5.csv"];
  private currentSimulatorFileIndex = 0;
  private simulatorData: any[] = [];
  private simulatorRowIndex = 0;

  private loadSimulatorData() {
    try {
      const fileName = this.simulatorFiles[this.currentSimulatorFileIndex];
      const logsDir = path.join(__dirname, "..", "..", "..", "logs");
      const filePath = path.join(logsDir, fileName);
      
      if (!fs.existsSync(filePath)) {
          console.error(`[SIMULATOR] File not found: ${filePath}`);
          return false;
      }
      
      const fileContent = fs.readFileSync(filePath, "utf-8");
      const lines = fileContent.split("\n").map(l => l.trim()).filter(l => l.length > 0);
      
      this.simulatorData = lines.slice(1).map(line => {
        const parts = line.split(",");
        return {
           oilTemp: parseFloat(parts[2]),
           vibration: parseFloat(parts[3]),
           flow: parseFloat(parts[4]),
           ambientTemp: parseFloat(parts[5])
        };
      });
      this.simulatorRowIndex = 0;
      console.log(`[SIMULATOR] Loaded ${this.simulatorData.length} rows from ${fileName}`);
      return true;
    } catch (e) {
      console.error("[SIMULATOR] Error loading data:", e);
      return false;
    }
  }

  private startSimulator() {
    this.isConnected = false;
    this.emit("connection", false);
    
    if (this.simulateInterval) clearInterval(this.simulateInterval);
    
    this.currentSimulatorFileIndex = 0;
    const success = this.loadSimulatorData();
    if (!success) {
       console.error("[SIMULATOR] Could not start, no test data available.");
       return;
    }
    
    this.simulateInterval = setInterval(() => {
      if (this.simulatorRowIndex >= this.simulatorData.length) {
          this.currentSimulatorFileIndex++;
          if (this.currentSimulatorFileIndex >= this.simulatorFiles.length) {
              this.currentSimulatorFileIndex = 0;
          }
          if (!this.loadSimulatorData()) {
              clearInterval(this.simulateInterval!);
              return;
          }
      }
      
      const row = this.simulatorData[this.simulatorRowIndex++];
      const line = `Flow (L/min): ${row.flow.toFixed(2)} | Temp (C): ${row.oilTemp.toFixed(2)} | Vibration (g): ${row.vibration.toFixed(2)} | Ambient (C): ${row.ambientTemp.toFixed(2)}`;
      this.parseData(line);
      
    }, 1000);
    
    console.log("Simulator started with CSV playback 🟢");
  }

  public disconnect(): void {
    this.running = false;
    if (this.simulateInterval) {
      clearInterval(this.simulateInterval);
      this.simulateInterval = null;
    }
    
    if (this.port && this.port.isOpen) {
      this.port.close();
    }
    this.isConnected = false;
    this.emit("connection", false);
    console.log("System stopped 🛑");
  }

  private handleDisconnect(): void {
    const wasConnected = this.isConnected;
    this.isConnected = false;
    this.emit("connection", false);
    
    // If we were running but lost connection, try simulator or just stay error
    if (this.running && wasConnected) {
       console.log("Connection lost. Restarting in simulator mode...");
       this.startSimulator();
    }
  }

  private currentBuffer: Partial<SerialData> = {};

  private parseData(line: string): void {
    try {
      const l = line.trim();
      
      // 1. Handle Multi-line Block Format
      if (l === "------ DATA ------" || l === "------ TRANSENSE DATA ------" || l === "--- SENSOR SUMMARY ---") {
        this.currentBuffer = {};
        return;
      }
      
      if (l.startsWith("---") && !l.includes("SUMMARY")) { // footer
        if (this.currentBuffer.flow !== undefined && this.currentBuffer.oilTemp !== undefined) {
          const payload: SerialData = {
            flow: this.currentBuffer.flow,
            oilTemp: this.currentBuffer.oilTemp,
            vibration: this.currentBuffer.vibration || 0,
            ambientTemp: this.currentBuffer.ambientTemp,
            raw: line
          };
          this.emit("data", payload);
        }
        return;
      }

      // Extract values with flexible whitespace handling (Supports V1, V2, and V3 labels)
      const vibMatch = l.match(/(?:Vibration|Vibe)\s*RMS:\s*([\d.]+)/i);
      const flowMatch = l.match(/Flow(?:\s*Rate)?\s*:\s*([\d.]+)/i);
      const oilMatch = l.match(/Oil\s*Temp:\s*([\d.]+)/i);
      const atmMatch = l.match(/(?:Atmos|Atmospheric|Air)\s*Temp:\s*([\d.]+)/i);
      
      if (vibMatch) this.currentBuffer.vibration = parseFloat(vibMatch[1]);
      if (flowMatch) this.currentBuffer.flow = parseFloat(flowMatch[1]);
      if (oilMatch) this.currentBuffer.oilTemp = parseFloat(oilMatch[1]);
      if (atmMatch) this.currentBuffer.ambientTemp = parseFloat(atmMatch[1]);

      // 2. Handle Single-line Format (Simulator and Old Sketch)
      const flowMatchSingle = l.match(/Flow\s*\(.*?\):\s*([\d.]+)/i);
      const oilMatchSingle = l.match(/Temp\s*\(.*?\):\s*([\d.]+)/i);
      const vibMatchSingle = l.match(/Vibration\s*\(.*?\):\s*([\d.]+)/i);
      const ambMatch = l.match(/Ambient\s*\(.*?\):\s*([\d.]+)/i);

      if (flowMatchSingle && oilMatchSingle && vibMatchSingle) {
        const payload: SerialData = {
          flow: parseFloat(flowMatchSingle[1]),
          oilTemp: parseFloat(oilMatchSingle[1]),
          vibration: parseFloat(vibMatchSingle[1]),
          ambientTemp: ambMatch ? parseFloat(ambMatch[1]) : undefined,
          raw: line
        };
        this.emit("data", payload);
      }
    } catch (e) {
      console.error("Error parsing serial line:", line, e);
    }
  }

  public getStatus() {
    return {
      connected: this.isConnected,
      running: this.running,
      port: SERIAL_CONFIG.port,
      mode: this.simulateInterval ? "SIMULATOR" : (this.isConnected ? "HARDWARE" : "IDLE")
    };
  }
}

export const serialService = new SerialService();
