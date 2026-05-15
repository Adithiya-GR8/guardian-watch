"""
Guardian Watch — Shared ML Utilities
CSV parser and feature engineering functions used by both training scripts.
"""

import pandas as pd
import numpy as np
import os


# =============================================================================
# CSV LOADING
# =============================================================================

def load_guardian_csv(filepath: str, target_column: str) -> pd.DataFrame:
    """
    Load a Guardian Watch CSV and extract Timestamp + one target column.

    Handles two format quirks:
      1. The timestamp contains a comma ("DD-MM-YYYY, HH:MM:SS am/pm")
         which shifts all columns right by one when parsed naively.
      2. Synthetic files may have blank lines (\r\r\n) between rows.

    Args:
        filepath: Absolute path to the CSV file.
        target_column: Either 'Oil_Temp_C' or 'Vibration_g'.

    Returns:
        DataFrame with columns ['Timestamp', target_column], sorted by time.
    """
    COLUMN_INDEX = {
        'Oil_Temp_C': 3,   # Column index after timestamp splits into 0,1
        'Vibration_g': 4,
    }

    if target_column not in COLUMN_INDEX:
        raise ValueError(f"Unknown target column: {target_column}. Use 'Oil_Temp_C' or 'Vibration_g'.")

    # Read raw — skip header row, ignore blank lines
    raw = pd.read_csv(filepath, header=None, skiprows=1, skip_blank_lines=True)

    # Reconstruct timestamp from columns 0 and 1
    ts_str = raw[0].astype(str).str.strip() + ', ' + raw[1].astype(str).str.strip()

    # Uppercase am/pm so strptime's %p directive works
    ts_str = ts_str.str.upper()

    result = pd.DataFrame()
    result['Timestamp'] = pd.to_datetime(ts_str, format='%d-%m-%Y, %I:%M:%S %p')
    result[target_column] = pd.to_numeric(raw[COLUMN_INDEX[target_column]], errors='coerce')

    # Drop any unparseable rows, sort chronologically
    result = result.dropna().sort_values('Timestamp').reset_index(drop=True)

    return result


# =============================================================================
# FEATURE ENGINEERING
# =============================================================================

WINDOW = 10  # 10-sample rolling window (~10 seconds at 1 Hz)


def compute_temp_features(df: pd.DataFrame, window: int = WINDOW) -> pd.DataFrame:
    """
    Compute 4 temperature features from a single session DataFrame.

    Features (in order):
      1. oil_temp              — current reading (°C)
      2. temp_rate_of_change   — (current − previous) / Δt  (°C/s)
      3. temp_rolling_mean     — mean over last `window` readings
      4. temp_rolling_std      — sample std (ddof=1) over last `window` readings

    Args:
        df: DataFrame with ['Timestamp', 'Oil_Temp_C'].
        window: Rolling window size.

    Returns:
        DataFrame with 4 feature columns, NaN rows dropped.
    """
    col = 'Oil_Temp_C'

    # Time delta in seconds between consecutive rows, floored at 0.1s
    dt = df['Timestamp'].diff().dt.total_seconds().clip(lower=0.1)

    features = pd.DataFrame(index=df.index)
    features['oil_temp'] = df[col]
    features['temp_rate_of_change'] = df[col].diff() / dt
    features['temp_rolling_mean'] = df[col].rolling(window, min_periods=window).mean()
    features['temp_rolling_std'] = df[col].rolling(window, min_periods=window).std()  # ddof=1

    return features.dropna().reset_index(drop=True)


def compute_vib_features(df: pd.DataFrame, window: int = WINDOW) -> pd.DataFrame:
    """
    Compute 5 vibration features from a single session DataFrame.

    Features (in order):
      1. vibration             — current reading (m/s²)
      2. vib_rate_of_change    — (current − previous) / Δt  (m/s²/s)
      3. vib_rolling_mean      — mean over last `window` readings
      4. vib_rms               — root-mean-square over last `window` readings
      5. vib_rolling_std       — sample std (ddof=1) over last `window` readings

    Args:
        df: DataFrame with ['Timestamp', 'Vibration_g'].
        window: Rolling window size.

    Returns:
        DataFrame with 5 feature columns, NaN rows dropped.
    """
    col = 'Vibration_g'

    dt = df['Timestamp'].diff().dt.total_seconds().clip(lower=0.1)

    features = pd.DataFrame(index=df.index)
    features['vibration'] = df[col]
    features['vib_rate_of_change'] = df[col].diff() / dt
    features['vib_rolling_mean'] = df[col].rolling(window, min_periods=window).mean()
    features['vib_rms'] = df[col].rolling(window, min_periods=window).apply(
        lambda x: np.sqrt(np.mean(x ** 2)), raw=True
    )
    features['vib_rolling_std'] = df[col].rolling(window, min_periods=window).std()  # ddof=1

    return features.dropna().reset_index(drop=True)


def load_and_engineer(files: list, logs_dir: str, target_col: str, feature_fn, window: int = WINDOW) -> pd.DataFrame:
    """
    Load multiple CSV files and compute features PER FILE to prevent
    rolling windows from leaking across session boundaries.

    Args:
        files: List of CSV filenames.
        logs_dir: Directory containing the CSV files.
        target_col: 'Oil_Temp_C' or 'Vibration_g'.
        feature_fn: compute_temp_features or compute_vib_features.
        window: Rolling window size.

    Returns:
        Concatenated DataFrame of all feature rows.
    """
    all_features = []

    for fname in files:
        filepath = os.path.join(logs_dir, fname)
        df = load_guardian_csv(filepath, target_col)
        features = feature_fn(df, window)
        print(f"  {fname}: {len(df)} raw rows -> {len(features)} feature rows")
        all_features.append(features)

    return pd.concat(all_features, ignore_index=True)
