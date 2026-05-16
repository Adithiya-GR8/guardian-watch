export const THRESHOLDS = {
  // Flow sensor — normal operating range: 1.6–2.1 L/min
  flowMin: 1.6,            // L/min (below = critical)
  flowMax: 2.1,            // L/min (above = unusually high)

  // Vibration — m/s²
  vibrationWatch: 8.5,     // m/s² (watch threshold)
  vibrationMax: 10.0,      // m/s² (critical threshold)

  // Oil temperature — °C
  oilTempWatch: 42.0,      // °C (watch threshold)
  oilTempMax: 45.0,        // °C (critical threshold)

  // Oil − Atmospheric temperature difference — °C
  tempDiffMax: 8.0,        // °C

  // Health index — /100
  healthLow: 60,           // Index / 100 (watch)
  healthCritical: 40       // Index / 100 (critical)
};

export const SERIAL_CONFIG = {
  baudRate: 115200,
  autoReconnectInterval: 5000,
  // IMPORTANT: On Windows, check Device Manager or Arduino IDE for your port (e.g., COM3, COM4)
  port: process.env.SERIAL_PORT || "COM4"
};

export const ML_CONFIG = {
  baseUrl: process.env.ML_SERVICE_URL || "http://127.0.0.1:8000"
};
