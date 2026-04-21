export const THRESHOLDS = {
  flowMin: 2.5,          // L/min
  flowHigh: 10.0,        // L/min (unusual high flow)
  vibrationMax: 0.20,    // g
  tempDiffMax: 15.0,     // Celsius
  oilTempMax: 65.0,      // Celsius
  healthLow: 60,         // Index / 100
  healthCritical: 40     // Index / 100
};

export const SERIAL_CONFIG = {
  baudRate: 9600,
  autoReconnectInterval: 5000,
  // IMPORTANT: On Windows, check Device Manager or Arduino IDE for your port (e.g., COM3, COM4)
  port: process.env.SERIAL_PORT || "COM3" 
};

export const ML_CONFIG = {
  baseUrl: process.env.ML_SERVICE_URL || "http://127.0.0.1:8000"
};
