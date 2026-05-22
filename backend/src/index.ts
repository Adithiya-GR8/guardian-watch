import express from "express";
import http from "http";
import cors from "cors";
import dotenv from "dotenv";
import apiRoutes from "./routes/api.js";
import { socketServer } from "./websocket/socket.js";
import { serialService } from "./services/serial.service.js";
import { dataProcessor } from "./services/dataProcessor.js";
import { mlService } from "./services/ml.service.js";
import { loggerService } from "./services/logger.service.js";
import { validationService } from "./services/validation.service.js";

dotenv.config();

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Initialize WebSocket
socketServer.init(server);

// Routes
app.use("/api", apiRoutes);

// =============================================================================
// MAIN DATA ORCHESTRATOR
// Pipeline: Serial → Validate → Process → ML Predict → Enhance Health → Broadcast
// =============================================================================

serialService.on("data", async (serialData) => {
  // 1. DATA VALIDATION — reject garbage before it enters the pipeline
  const validated = validationService.validate(serialData);
  if (!validated) return; // silently drop invalid readings

  // 2. Process basic rules and calculate base health index
  const processed = dataProcessor.process(validated);

  // 3. Enrich with ML predictions (anomaly detection + severity scoring)
  const mlPredictions = await mlService.getPredictions(processed.vibration, processed.oilTemp);

  // 4. ENHANCE HEALTH INDEX — integrate ML severity into the score
  const enhancedHealth = dataProcessor.enhanceHealthIndex(
    processed.healthIndex,
    {
      tempSeverity: mlPredictions.details.tempSeverity,
      vibSeverity: mlPredictions.details.vibSeverity,
    }
  );

  // 5. Construct final payload
  const alerts = [...processed.alerts];
  if (mlPredictions.failure) {
    alerts.push("ML_FAILURE_PREDICTED");
  }

  const finalPayload = {
    status: "RUNNING",
    machineConnected: serialService.getStatus().connected,
    mode: serialService.getStatus().mode,
    oilTemp: processed.oilTemp,
    ambientTemp: processed.ambientTemp,
    flow: processed.flow,
    vibration: processed.vibration,
    tempDiff: processed.tempDiff,
    healthIndex: enhancedHealth,
    alerts: alerts,
    mlPrediction: mlPredictions,
    ts: Date.now()
  };

  // 6. Broadcast to all frontend clients
  socketServer.broadcast(finalPayload);

  // 7. Log to CSV
  loggerService.log(finalPayload);
});

// Serial Connection Error Handler (for WebSocket updates)
serialService.on("connection", (connected) => {
  if (!connected && serialService.getStatus().mode !== "SIMULATOR") {
    socketServer.broadcast({
      status: "ERROR",
      machineConnected: false,
      mode: "IDLE",
      oilTemp: 0,
      ambientTemp: 0,
      flow: 0,
      vibration: 0,
      tempDiff: 0,
      healthIndex: 0,
      alerts: [],
      mlPrediction: {
        vibration: "SERVICE_DOWN",
        temperature: "SERVICE_DOWN",
        failure: false
      },
      ts: Date.now(),
      message: "Machine not attached"
    });
  }
});

// Start Server
server.listen(PORT, () => {
  console.log(`
Transense Backend Running
--------------------------------
API: http://localhost:${PORT}/api
WebSocket: ws://localhost:${PORT}
--------------------------------
  `);
});
