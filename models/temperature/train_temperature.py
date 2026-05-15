"""
Guardian Watch — Temperature Anomaly Detection Model Training
=============================================================
Algorithm:  Isolation Forest (scikit-learn)
Features:   oil_temp, rate_of_change, rolling_mean, rolling_std
Window:     10 readings (~10 seconds at 1 Hz)

Train set:  data.csv, synthetic_data_1.csv, synthetic_data_2.csv, synthetic_data_3.csv
Test set:   synthetic_data_4.csv, synthetic_data_5.csv
"""

import os
import sys
import numpy as np
import joblib
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest

# Add parent dir so we can import shared utilities
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from utils import load_and_engineer, compute_temp_features

# =============================================================================
# CONFIGURATION
# =============================================================================

LOGS_DIR = os.path.join(os.path.dirname(__file__), '..', '..', 'logs')
OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

TRAIN_FILES = [
    'data.csv',
    'synthetic_data_1.csv',
    'synthetic_data_2.csv',
    'synthetic_data_3.csv',
]

TEST_FILES = [
    'synthetic_data_4.csv',
    'synthetic_data_5.csv',
]

TARGET_COL = 'Oil_Temp_C'
WINDOW = 10

# Isolation Forest hyperparameters
N_ESTIMATORS = 150
CONTAMINATION = 0.08    # ~8% of training data contains fault behavior
RANDOM_STATE = 42

# =============================================================================
# TRAINING
# =============================================================================

print("=" * 60)
print("  GUARDIAN WATCH — TEMPERATURE MODEL TRAINING")
print("=" * 60)

print("\n[1/4] Loading and engineering training features...")
X_train = load_and_engineer(TRAIN_FILES, LOGS_DIR, TARGET_COL, compute_temp_features, WINDOW)
print(f"\n  Total training rows: {len(X_train)}")
print(f"  Features: {list(X_train.columns)}")
print(f"\n  Training statistics:\n{X_train.describe().to_string()}")

print("\n[2/4] Fitting StandardScaler...")
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
print(f"  Scaler means: {np.round(scaler.mean_, 4)}")
print(f"  Scaler stds:  {np.round(np.sqrt(scaler.var_), 4)}")

print("\n[3/4] Training Isolation Forest...")
model = IsolationForest(
    n_estimators=N_ESTIMATORS,
    contamination=CONTAMINATION,
    random_state=RANDOM_STATE,
    n_jobs=-1,
)
model.fit(X_train_scaled)

# Training set self-check
train_preds = model.predict(X_train_scaled)
train_scores = model.decision_function(X_train_scaled)
n_train_anomaly = np.sum(train_preds == -1)
print(f"  Training self-check: {n_train_anomaly}/{len(train_preds)} anomalies "
      f"({n_train_anomaly / len(train_preds) * 100:.1f}%)")

print("\n[4/4] Saving artifacts...")
model_path = os.path.join(OUTPUT_DIR, 'isolation_forest_model.pkl')
scaler_path = os.path.join(OUTPUT_DIR, 'scaler.pkl')
joblib.dump(model, model_path)
joblib.dump(scaler, scaler_path)
print(f"  [OK] Model  -> {model_path}")
print(f"  [OK] Scaler -> {scaler_path}")

# =============================================================================
# EVALUATION
# =============================================================================

print("\n" + "=" * 60)
print("  EVALUATION ON HELD-OUT TEST SET")
print("=" * 60)

print("\nLoading test features...")
X_test = load_and_engineer(TEST_FILES, LOGS_DIR, TARGET_COL, compute_temp_features, WINDOW)
print(f"\n  Total test rows: {len(X_test)}")

X_test_scaled = scaler.transform(X_test)
test_preds = model.predict(X_test_scaled)
test_scores = model.decision_function(X_test_scaled)

n_normal = np.sum(test_preds == 1)
n_anomaly = np.sum(test_preds == -1)

print(f"\n  Results:")
print(f"    NORMAL:  {n_normal} ({n_normal / len(test_preds) * 100:.1f}%)")
print(f"    ANOMALY: {n_anomaly} ({n_anomaly / len(test_preds) * 100:.1f}%)")
print(f"    Score range: [{test_scores.min():.4f}, {test_scores.max():.4f}]")
print(f"    Score mean:  {test_scores.mean():.4f}")
print(f"    Score std:   {test_scores.std():.4f}")

# Show score distribution in anomaly vs normal segments
print(f"\n  Score breakdown:")
normal_scores = test_scores[test_preds == 1]
anomaly_scores = test_scores[test_preds == -1]
if len(normal_scores) > 0:
    print(f"    Normal  readings — mean score: {normal_scores.mean():.4f}")
if len(anomaly_scores) > 0:
    print(f"    Anomaly readings — mean score: {anomaly_scores.mean():.4f}")

print("\n" + "=" * 60)
print("  Temperature model training complete.")
print("=" * 60)
