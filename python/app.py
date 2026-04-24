import os
import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import tensorflow as tf

app = FastAPI(title="Guardian Watch ML Service")

# Paths to models and scalers
MODELS_DIR = os.path.join(os.path.dirname(__file__), "..", "models")
TEMP_MODEL_PATH = os.path.join(MODELS_DIR, "temperature", "isolation_forest_model.pkl")
TEMP_SCALER_PATH = os.path.join(MODELS_DIR, "temperature", "scaler.pkl")
VIB_MODEL_PATH = os.path.join(MODELS_DIR, "vibration", "vibration_model.h5")
VIB_SCALER_PATH = os.path.join(MODELS_DIR, "vibration", "scaler.pkl")

# In-memory storage for models and scalers
state = {
    "temp_model": None,
    "temp_scaler": None,
    "vib_model": None,
    "vib_scaler": None
}

@app.on_event("startup")
async def startup_event():
    try:
        # Load Temperature Model
        if os.path.exists(TEMP_MODEL_PATH):
            state["temp_model"] = joblib.load(TEMP_MODEL_PATH)
            state["temp_scaler"] = joblib.load(TEMP_SCALER_PATH)
            print(f"LOADED: Temperature model from {TEMP_MODEL_PATH}")
        else:
            print(f"MISSING: Temperature model at {TEMP_MODEL_PATH}")
            
        # Load Vibration Model
        if os.path.exists(VIB_MODEL_PATH):
            try:
                # Sometimes models saved with older Keras versions need compile=False
                state["vib_model"] = tf.keras.models.load_model(VIB_MODEL_PATH, compile=False)
                state["vib_scaler"] = joblib.load(VIB_SCALER_PATH)
                print(f"LOADED: Vibration model from {VIB_MODEL_PATH}")
            except Exception as e:
                print(f"FAILED: Could not load vibration model: {e}")
        else:
            print(f"MISSING: Vibration model at {VIB_MODEL_PATH}")
        
        print("ML Service initialization complete")
    except Exception as e:
        print(f"CRITICAL: Error during startup: {e}")

class TempRequest(BaseModel):
    # The temperature model needs a small window to calculate features
    # But since the Node.js backend can provide pre-calculated features, 
    # we'll accept the feature vector directly or a window.
    # To keep it simple and robust, let's accept the features: [OT, rolling_mean, rate_of_change, rolling_std, acceleration]
    features: List[float]

class VibRequest(BaseModel):
    # Vibration model expects a window of 50 samples, then we calculate [mean, std, max, min, rms]
    # To keep the API efficient, let's accept the raw window or the pre-calculated features.
    # Let's say Node.js sends the raw window of 50 values.
    samples: List[float]

@app.post("/predict/temperature")
async def predict_temperature(req: TempRequest):
    if not state["temp_model"] or not state["temp_scaler"]:
        raise HTTPException(status_code=500, detail="Temperature model not loaded")
    
    try:
        data = np.array([req.features])
        scaled_data = state["temp_scaler"].transform(data)
        
        prediction = state["temp_model"].predict(scaled_data)[0]
        score = state["temp_model"].decision_function(scaled_data)[0]
        
        status = "NORMAL"
        if prediction == -1:
            # Isolation Forest anomaly
            if score < -0.05: # Lowered threshold from -0.15 for better sensitivity
                status = "FAILURE"
            else:
                status = "WARNING"
                
        print(f"DEBUG: Temp Prediction: {status} (Score: {score:.4f})")
        return {"status": status, "score": float(score)}
    except Exception as e:
        print(f"ERROR: Temperature prediction failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/predict/vibration")
async def predict_vibration(req: VibRequest):
    if not state["vib_model"] or not state["vib_scaler"]:
        raise HTTPException(status_code=500, detail="Vibration model not loaded")
    
    try:
        w = np.array(req.samples)
        
        # Convert to DataFrame to avoid "X does not have valid feature names" warning/error
        # Assuming the original feature name was 'Vibration' or just using a dummy name
        df_w = pd.DataFrame(w, columns=['Vibration'])
        
        # Scaling consistently with training
        scaled_samples = state["vib_scaler"].transform(df_w).flatten()
        
        # Re-calculate features on scaled samples: [mean, std, max, min, rms]
        w_s = scaled_samples
        features_scaled = np.array([[
            np.mean(w_s), 
            np.std(w_s), 
            np.max(w_s), 
            np.min(w_s), 
            np.sqrt(np.mean(w_s**2))
        ]])
        
        # Model expects shape (1, 1, 5)
        X = features_scaled.reshape(1, 1, 5)
        reconstruction = state["vib_model"].predict(X, verbose=0)
        
        # MSE (Reconstruction Error)
        mse = np.mean(np.power(X - reconstruction, 2))
        
        status = "NORMAL"
        if mse > 0.005:
            status = "FAILURE"
        elif mse > 0.001:
            status = "WARNING"
            
        print(f"DEBUG: Vib Prediction: {status} (MSE: {mse:.6f})")
        return {"status": status, "mse": float(mse)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"ERROR: Vibration prediction failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/health")
async def health():
    return {
        "status": "online",
        "models": {
            "temperature": "LOADED" if state["temp_model"] else "MISSING",
            "vibration": "LOADED" if state["vib_model"] else "MISSING"
        }
    }

if __name__ == "__main__":
    import uvicorn
    # Use 127.0.0.1 explicitly to match the Node.js backend expectation
    print("Starting Guardian Watch ML Service...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
