import { SerialPort } from "serialport";
import { ReadlineParser } from "@serialport/parser-readline";
import { SERIAL_CONFIG } from "../config/thresholds.js";
import { EventEmitter } from "events";

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

  private cycleCount = 0;

  private startSimulator() {
    this.isConnected = false;
    this.emit("connection", false);
    
    if (this.simulateInterval) clearInterval(this.simulateInterval);
    
    this.simulateInterval = setInterval(() => {
      this.cycleCount++;
      
      // Normally stable data
      let flow = 3.5 + Math.sin(Date.now() / 5000) * 0.5 + (Math.random() * 0.1);
      let temp = 40.0 + Math.sin(Date.now() / 10000) * 5 + (Math.random() * 0.2);
      let vibration = 0.02 + Math.abs(Math.sin(Date.now() / 2000)) * 0.05 + (Math.random() * 0.01);
      
      // Trigger Anomaly every 30 cycles (approx 30 seconds)
      // Cycle 30-40 will be CRITICAL
      const isAnomaly = (this.cycleCount % 60) >= 30 && (this.cycleCount % 60) <= 40;
      
      if (isAnomaly) {
        // Sudden failure scenario: Low flow, high vibration, rising temp
        flow = 1.2 + (Math.random() * 0.3); // Critical (< 2.5)
        vibration = 0.3 + (Math.random() * 0.2); // Critical (> 0.2)
        temp = 68.0 + (Math.random() * 5); // Critical (> 65)
      }
      
      const line = `Flow (L/min): ${flow.toFixed(2)} | Temp (C): ${temp.toFixed(2)} | Vibration (g): ${vibration.toFixed(2)}`;
      this.parseData(line);
    }, 1000);
    
    console.log("Simulator started with anomaly cycles 🟢");
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
      
      // 1. Handle Multi-line Block Format (New Sketch)
      if (l === "------ DATA ------") {
        this.currentBuffer = {};
        return;
      }
      
      if (l.startsWith("---")) { // footer
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

      // Extract values from individual lines (New Format)
      const vibMatchNew = l.match(/Vibration RMS:\s*([\d.]+)/i);
      const flowMatchNew = l.match(/Flow Rate:\s*([\d.]+)/i);
      const oilMatch = l.match(/Oil Temp:\s*([\d.]+)/i);
      const dsTempMatch = l.match(/DS18B20 Temp:\s*([\d.]+)/i); // Fallback
      const atmMatch = l.match(/Atmospheric Temp:\s*([\d.]+)/i);
      const dhtTempMatch = l.match(/DHT Temp:\s*([\d.]+)/i); // Fallback
      
      if (vibMatchNew) this.currentBuffer.vibration = parseFloat(vibMatchNew[1]);
      if (flowMatchNew) this.currentBuffer.flow = parseFloat(flowMatchNew[1]);
      if (oilMatch) this.currentBuffer.oilTemp = parseFloat(oilMatch[1]);
      if (dsTempMatch) this.currentBuffer.oilTemp = parseFloat(dsTempMatch[1]);
      if (atmMatch) this.currentBuffer.ambientTemp = parseFloat(atmMatch[1]);
      if (dhtTempMatch) this.currentBuffer.ambientTemp = parseFloat(dhtTempMatch[1]);

      // 2. Handle Single-line Format (Simulator and Old Sketch)
      const flowMatch = l.match(/Flow\s*\(.*?\):\s*([\d.]+)/i);
      const oilMatch = l.match(/Temp\s*\(.*?\):\s*([\d.]+)/i);
      const vibMatch = l.match(/Vibration\s*\(.*?\):\s*([\d.]+)/i);
      const ambMatch = l.match(/Ambient\s*\(.*?\):\s*([\d.]+)/i);

      if (flowMatch && oilMatch && vibMatch) {
        const payload: SerialData = {
          flow: parseFloat(flowMatch[1]),
          oilTemp: parseFloat(oilMatch[1]),
          vibration: parseFloat(vibMatch[1]),
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
