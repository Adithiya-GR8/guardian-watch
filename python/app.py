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
VIB_MODEL_H5_PATH = os.path.join(MODELS_DIR, "vibration", "vibration_model.h5")
VIB_SCALER_PATH = os.path.join(MODELS_DIR, "vibration", "scaler.pkl")
VIB_THRESHOLD_PATH = os.path.join(MODELS_DIR, "vibration", "vibration_threshold.pkl")

# In-memory storage for models and scalers
state = {
    "temp_model": None,
    "temp_scaler": None,
    "vib_model": None,
    "vib_model_type": None, # "h5" or "pkl"
    "vib_scaler": None,
    "vib_threshold": 0.001 # Default sensitive threshold
}

def build_vib_model(num_features=5):
    from tensorflow.keras.models import Model
    from tensorflow.keras.layers import Input, LSTM, RepeatVector, Dense
    inputs = Input(shape=(1, num_features))
    encoded = LSTM(16, activation='relu')(inputs)
    decoded = RepeatVector(1)(encoded)
    decoded = LSTM(16, activation='relu', return_sequences=True)(decoded)
    outputs = Dense(num_features)(decoded)
    return Model(inputs, outputs)

@app.on_event("startup")
async def startup_event():
    try:
        # Load Temperature Model
        if os.path.exists(TEMP_MODEL_PATH):
            try:
                state["temp_model"] = joblib.load(TEMP_MODEL_PATH)
                state["temp_scaler"] = joblib.load(TEMP_SCALER_PATH)
                print(f"LOADED: Temperature model from {TEMP_MODEL_PATH}")
            except Exception as e:
                print(f"FAILED: Temperature model load error: {e}")
        else:
            print(f"MISSING: Temperature model at {TEMP_MODEL_PATH}")
            
        # Load Vibration Model
        loaded_vib = False
        if os.path.exists(VIB_MODEL_H5_PATH):
            try:
                # Try loading weights into a fresh model to avoid InputLayer version issues
                model = build_vib_model()
                model.load_weights(VIB_MODEL_H5_PATH)
                state["vib_model"] = model
                state["vib_scaler"] = joblib.load(VIB_SCALER_PATH)
                state["vib_model_type"] = "h5"
                loaded_vib = True
                
                # Load threshold if exists
                if os.path.exists(VIB_THRESHOLD_PATH):
                    state["vib_threshold"] = joblib.load(VIB_THRESHOLD_PATH)
                    print(f"LOADED: Vibration threshold ({state['vib_threshold']:.4f})")
                
                print(f"LOADED: Vibration model (H5 Weights) from {VIB_MODEL_H5_PATH}")
            except Exception as e:
                print(f"FAILED: Could not load vibration H5 weights: {e}")
                print("Trying direct load_model fallback...")
                try:
                    state["vib_model"] = tf.keras.models.load_model(VIB_MODEL_H5_PATH, compile=False)
                    state["vib_scaler"] = joblib.load(VIB_SCALER_PATH)
                    state["vib_model_type"] = "h5"
                    loaded_vib = True
                    print("LOADED: Vibration model via direct load_model")
                except Exception as e2:
                    print(f"FAILED: Direct load_model also failed: {e2}")

        if not loaded_vib:
            print("MISSING: No valid vibration model found (.h5)")
        
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
        df_w = pd.DataFrame(w, columns=['Vibration'])
        scaled_samples = state["vib_scaler"].transform(df_w).flatten()
        
        # Calculate features: [mean, std, max, min, rms]
        features = np.array([[
            np.mean(scaled_samples), 
            np.std(scaled_samples), 
            np.max(scaled_samples), 
            np.min(scaled_samples), 
            np.sqrt(np.mean(scaled_samples**2))
        ]])
        
        status = "NORMAL"
        debug_val = 0.0
        
        if state["vib_model_type"] == "h5":
            # Autoencoder Reconstruction logic
            X = features.reshape(1, 1, 5)
            reconstruction = state["vib_model"].predict(X, verbose=0)
            
            # Using MAE (Mean Absolute Error) to match train.txt thresholding
            mae = np.mean(np.abs(X.reshape(5) - reconstruction.reshape(5)))
            debug_val = float(mae)
            
            # Calibration: Use the threshold from training
            # FAILURE at 1.5x threshold, WARNING at 1.0x threshold
            threshold = state["vib_threshold"]
            
            if mae > (threshold * 1.5):
                status = "FAILURE"
            elif mae > threshold:
                status = "WARNING"
            
            # log for every request to troubleshoot why "no predictions" are seen
            print(f"VIB REQ: {len(w)} samples | MAE: {mae:.6f} | Thr: {threshold:.6f} | Status: {status}")
            
        else:
            # Fallback PKL (Assuming Isolation Forest or similar)
            # Some PKL models might expect the 2D feature array directly
            prediction = state["vib_model"].predict(features)[0]
            # IsolationForest: -1 for anomaly, 1 for normal
            score = 0.0
            if hasattr(state["vib_model"], "decision_function"):
                score = state["vib_model"].decision_function(features)[0]
            debug_val = float(score)
            
            if prediction == -1:
                if score < -0.05:
                    status = "FAILURE"
                else:
                    status = "WARNING"
            print(f"DEBUG: Vib Prediction (PKL): {status} (Score: {score:.4f})")

        return {"status": status, "value": debug_val, "type": state["vib_model_type"]}
        
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
