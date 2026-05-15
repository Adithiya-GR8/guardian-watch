"""
Guardian Watch — ML Prediction Service (FastAPI)
=================================================
Serves two stateless Isolation Forest models for real-time anomaly detection.
Each endpoint accepts pre-computed features from the Node.js backend,
scales them, runs the model, and returns a raw anomaly verdict + score.

Temporal persistence filtering is handled by the Node.js caller, NOT here.
This service is intentionally stateless for testability and debuggability.
"""

import os
import warnings
import joblib
import numpy as np
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List

# Suppress benign scikit-learn warning about feature names
# (Scaler was fitted with DataFrame columns; inference sends plain arrays)
warnings.filterwarnings("ignore", message="X does not have valid feature names")

app = FastAPI(title="Guardian Watch ML Service")

# =============================================================================
# MODEL PATHS
# =============================================================================

MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")

TEMP_MODEL_PATH = os.path.join(MODELS_DIR, "temperature", "isolation_forest_model.pkl")
TEMP_SCALER_PATH = os.path.join(MODELS_DIR, "temperature", "scaler.pkl")

VIB_MODEL_PATH = os.path.join(MODELS_DIR, "vibration", "isolation_forest_model.pkl")
VIB_SCALER_PATH = os.path.join(MODELS_DIR, "vibration", "scaler.pkl")

# =============================================================================
# IN-MEMORY STATE
# =============================================================================

state = {
    "temp_model": None,
    "temp_scaler": None,
    "vib_model": None,
    "vib_scaler": None,
}

# =============================================================================
# STARTUP — Load Models
# =============================================================================

@app.on_event("startup")
async def startup_event():
    """Load both Isolation Forest models and their scalers at startup."""
    try:
        # --- Temperature Model ---
        if os.path.exists(TEMP_MODEL_PATH) and os.path.exists(TEMP_SCALER_PATH):
            try:
                state["temp_model"] = joblib.load(TEMP_MODEL_PATH)
                state["temp_scaler"] = joblib.load(TEMP_SCALER_PATH)
                print(f"LOADED: Temperature model from {TEMP_MODEL_PATH}")
            except Exception as e:
                print(f"FAILED: Temperature model load error: {e}")
        else:
            print(f"MISSING: Temperature model at {TEMP_MODEL_PATH}")

        # --- Vibration Model ---
        if os.path.exists(VIB_MODEL_PATH) and os.path.exists(VIB_SCALER_PATH):
            try:
                state["vib_model"] = joblib.load(VIB_MODEL_PATH)
                state["vib_scaler"] = joblib.load(VIB_SCALER_PATH)
                print(f"LOADED: Vibration model from {VIB_MODEL_PATH}")
            except Exception as e:
                print(f"FAILED: Vibration model load error: {e}")
        else:
            print(f"MISSING: Vibration model at {VIB_MODEL_PATH}")

        print("ML Service initialization complete")
    except Exception as e:
        print(f"CRITICAL: Error during startup: {e}")

# =============================================================================
# REQUEST SCHEMAS
# =============================================================================

class TempRequest(BaseModel):
    """
    Temperature prediction request.
    Features (4 floats, computed by Node.js):
      [oil_temp, rate_of_change, rolling_mean, rolling_std]
    """
    features: List[float]


class VibRequest(BaseModel):
    """
    Vibration prediction request.
    Features (5 floats, computed by Node.js):
      [vibration, rate_of_change, rolling_mean, rms, rolling_std]
    """
    features: List[float]

# =============================================================================
# PREDICTION ENDPOINTS
# =============================================================================

@app.post("/predict/temperature")
async def predict_temperature(req: TempRequest):
    """
    Stateless temperature anomaly prediction.
    Returns raw model verdict: NORMAL or ANOMALY, plus the decision score.
    Persistence filtering is applied by the Node.js caller.
    """
    if not state["temp_model"] or not state["temp_scaler"]:
        raise HTTPException(status_code=500, detail="Temperature model not loaded")

    try:
        data = np.array([req.features])
        scaled = state["temp_scaler"].transform(data)

        prediction = state["temp_model"].predict(scaled)[0]
        score = float(state["temp_model"].decision_function(scaled)[0])

        # IsolationForest: 1 = inlier (normal), -1 = outlier (anomaly)
        status = "ANOMALY" if prediction == -1 else "NORMAL"

        print(f"TEMP: {status} (score: {score:.4f}) | features: {[round(f, 3) for f in req.features]}")
        return {"status": status, "score": score}

    except Exception as e:
        print(f"ERROR: Temperature prediction failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/predict/vibration")
async def predict_vibration(req: VibRequest):
    """
    Stateless vibration anomaly prediction.
    Returns raw model verdict: NORMAL or ANOMALY, plus the decision score.
    Persistence filtering is applied by the Node.js caller.
    """
    if not state["vib_model"] or not state["vib_scaler"]:
        raise HTTPException(status_code=500, detail="Vibration model not loaded")

    try:
        data = np.array([req.features])
        scaled = state["vib_scaler"].transform(data)

        prediction = state["vib_model"].predict(scaled)[0]
        score = float(state["vib_model"].decision_function(scaled)[0])

        status = "ANOMALY" if prediction == -1 else "NORMAL"

        print(f"VIB:  {status} (score: {score:.4f}) | features: {[round(f, 3) for f in req.features]}")
        return {"status": status, "score": score}

    except Exception as e:
        print(f"ERROR: Vibration prediction failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

# =============================================================================
# HEALTH CHECK
# =============================================================================

@app.get("/health")
async def health():
    return {
        "status": "online",
        "models": {
            "temperature": "LOADED" if state["temp_model"] else "MISSING",
            "vibration": "LOADED" if state["vib_model"] else "MISSING",
        }
    }

# =============================================================================
# ENTRYPOINT
# =============================================================================

if __name__ == "__main__":
    import uvicorn
    print("Starting Guardian Watch ML Service...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
