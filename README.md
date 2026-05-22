# AI-Based Transformer Health Monitoring Backend

This is the production-ready backend for the Transense system. It interfaces directly with Arduino hardware via Serial and provides real-time telemetry enriched with Machine Learning predictions.

## Architecture
**Arduino UNO** (Serial) → **Node.js/TypeScript** (Processor) ↔ **Python FastAPI** (ML) → **Frontend** (WebSocket)

---

## Prerequisites
- **Node.js** (v18+)
- **Python** (v3.9+)
- **Arduino UNO** with sensors connected.

---

## Setup Instructions

### 1. Arduino Configuration
Ensure your Arduino is flashed with the provided testing code. 
- **Baud Rate**: 9600
- **Format**: `Flow (L/min): 3.47 | Temp (C): 37.75 | Vibration (g): 0.00`

### 2. Python ML Service
1. Navigate to `/python`
2. Install dependencies:
   ```bash
   pip install fastapi uvicorn joblib numpy scikit-learn tensorflow
   ```
3. Place your models in `/python/models/`:
   - `vibration_model.pkl` or `.h5`
   - `temperature_model.pkl` or `.h5`
4. Start the service:
   ```bash
   python app.py
   ```

### 3. Node.js Backend
1. Navigate to `/backend`
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your COM port in `src/config/thresholds.ts` or set environment variable `SERIAL_PORT`.
4. Start development server:
   ```bash
   npm run dev
   ```

---

## ML Model Integration
The system automatically detects your models.
- **Support**: Scikit-Learn (`.pkl`) and TensorFlow Keras (`.h5`).
- **Dynamic Loading**: If a model file is missing, the API returns `MODEL_NOT_FOUND` without crashing.

---

## API Endpoints

### System Control
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/start` | Initialize serial connection and start processing. |
| POST | `/api/stop` | Stop serial communication and streaming. |
| GET | `/api/status` | Get current system and machine connection status. |

### Real-Time Streaming
- **WebSocket**: `ws://localhost:3001`
- **Format**: Structured JSON with sensor data, alerts, and ML predictions.

---

## Error Handling
- **Arduino Unplugged**: The backend broadcasts `machineConnected: false` and attempts to auto-reconnect every 5 seconds.
- **Python Service Down**: The system defaults ML predictions to `SERVICE_DOWN` and continues operating with rule-based logic.
- **Model Missing**: Individual model states will show `MODEL_NOT_FOUND`.
