# ==========================================
# TEMPERATURE ANOMALY DETECTION (TIME-AWARE)
# FINAL TRAINING CODE
# ==========================================

import pandas as pd
import numpy as np
import matplotlib.pyplot as plt
import joblib
import tensorflow as tf

from sklearn.preprocessing import StandardScaler, MinMaxScaler
from sklearn.ensemble import IsolationForest
from sklearn.svm import OneClassSVM

from tensorflow.keras.models import Model
from tensorflow.keras.layers import Input, LSTM, RepeatVector, TimeDistributed, Dense

# ==========================================
# STEP 1: LOAD DATA
# ==========================================
df = pd.read_csv("ETTm1.csv")

df['date'] = pd.to_datetime(df['date'])
df = df[['date', 'OT']]

# ==========================================
# STEP 2: TIME-AWARE FEATURE ENGINEERING
# ==========================================

# Time difference in minutes (ETTm1 is 15 min interval)
df['time_diff'] = df['date'].diff().dt.total_seconds() / 60.0

# Temperature difference
df['temp_diff'] = df['OT'].diff()

# 🔥 CRITICAL FEATURE (NEW)
df['rate_of_change'] = df['temp_diff'] / df['time_diff']

# Rolling statistics
df['rolling_mean'] = df['OT'].rolling(window=5).mean()
df['rolling_std'] = df['OT'].rolling(window=5).std()

# Acceleration (change in rate)
df['acceleration'] = df['rate_of_change'].diff()

df = df.dropna()

# ==========================================
# FINAL FEATURES (UPDATED)
# ==========================================
features = df[['OT', 'rolling_mean', 'rate_of_change', 'rolling_std', 'acceleration']]

# ==========================================
# STEP 3: NORMALIZATION
# ==========================================
scaler = StandardScaler()
X = scaler.fit_transform(features)

# ==========================================
# MODEL 1: ISOLATION FOREST
# ==========================================
model_if = IsolationForest(
    n_estimators=100,
    contamination=0.05,
    random_state=42
)

model_if.fit(X)
df['anomaly_if'] = model_if.predict(X)

# ==========================================
# MODEL 2: ONE-CLASS SVM
# ==========================================
model_svm = OneClassSVM(
    kernel='rbf',
    gamma='auto',
    nu=0.05
)

model_svm.fit(X)
df['anomaly_svm'] = model_svm.predict(X)

# ==========================================
# MODEL 3: LSTM AUTOENCODER (UPDATED)
# ==========================================
scaler_lstm = MinMaxScaler()
X_scaled = scaler_lstm.fit_transform(features)

# Create sequences
def create_sequences(data, time_steps=10):
    X_seq = []
    for i in range(len(data) - time_steps):
        X_seq.append(data[i:i+time_steps])
    return np.array(X_seq)

X_seq = create_sequences(X_scaled)

timesteps = X_seq.shape[1]
n_features = X_seq.shape[2]

# Model
inputs = Input(shape=(timesteps, n_features))

encoded = LSTM(16, activation='relu')(inputs)
decoded = RepeatVector(timesteps)(encoded)
decoded = LSTM(16, activation='relu', return_sequences=True)(decoded)
decoded = TimeDistributed(Dense(n_features))(decoded)

autoencoder = Model(inputs, decoded)
autoencoder.compile(optimizer='adam', loss='mse')

# Train
autoencoder.fit(
    X_seq, X_seq,
    epochs=5,
    batch_size=32,
    validation_split=0.1,
    verbose=1
)

# Reconstruction error
X_pred = autoencoder.predict(X_seq)

mse = np.mean(np.power(X_seq - X_pred, 2), axis=(1, 2))
threshold = np.percentile(mse, 95)

df['anomaly_lstm'] = 0
df.loc[df.index[10:], 'anomaly_lstm'] = (mse > threshold).astype(int)

# ==========================================
# STEP 4: SAVE EVERYTHING
# ==========================================

joblib.dump(model_if, "isolation_forest_model.pkl")
joblib.dump(model_svm, "svm_model.pkl")

joblib.dump(scaler, "scaler.pkl")
joblib.dump(scaler_lstm, "lstm_scaler.pkl")

autoencoder.save("lstm_autoencoder.h5")

print("✅ Models trained with time-aware features and saved!")

# ==========================================
# STEP 5: VISUALIZATION
# ==========================================
plt.figure(figsize=(15, 6))

plt.plot(df['OT'], label='Temperature')

anomalies = df[df['anomaly_if'] == -1]
plt.scatter(anomalies.index, anomalies['OT'],
            color='red', label='Anomalies')

plt.title("Time-Aware Temperature Anomaly Detection")
plt.legend()
plt.show()

# ==========================================
# GPU CHECK
# ==========================================
print("Num GPUs Available:", len(tf.config.list_physical_devices('GPU')))

print("🚀 Training complete.")