"""
Synthetic Data Generator for Guardian Watch
Generates multiple CSV files with realistic industrial motor sensor readings.
"""

import random
import math
import csv
import os
from datetime import datetime, timedelta

random.seed(42)

OUTPUT_DIR = os.path.dirname(os.path.abspath(__file__))

# ============================================================
# HELPERS
# ============================================================

def clamp(v, lo, hi):
    return max(lo, min(hi, v))

def noise(scale=0.1):
    return random.gauss(0, scale)

def smooth_walk(current, target, rate=0.05, noise_scale=0.02):
    """Random walk that drifts toward a target with noise."""
    return current + (target - current) * rate + noise(noise_scale)

def format_ts(dt):
    """Match original format: DD-MM-YYYY, HH:MM:SS am/pm"""
    return dt.strftime("%d-%m-%Y, %I:%M:%S %p").lower()

# ============================================================
# SCENARIO DEFINITIONS
# ============================================================

class MotorSession:
    """Simulates a complete motor session with phases."""

    def __init__(self, start_time, duration_rows, scenario_type):
        self.ts = start_time
        self.duration = duration_rows
        self.scenario = scenario_type
        self.row = 0

        # State
        self.oil_temp = 0.0
        self.vibration = 0.0
        self.flow = 0.0
        self.ambient = random.uniform(32.5, 34.5)
        self.health = 100
        self.phase = "startup"

    def _startup_phase(self):
        """First 5-8 rows: sensor initialization, values climbing from 0."""
        progress = self.row / max(1, self._startup_len)
        self.oil_temp = smooth_walk(self.oil_temp, self._base_oil, rate=0.3 + progress * 0.2, noise_scale=0.05)
        self.vibration = abs(smooth_walk(self.vibration, self._base_vib, rate=0.15, noise_scale=0.3))
        self.flow = smooth_walk(self.flow, self._base_flow, rate=0.2, noise_scale=0.1)
        if self.row >= self._startup_len:
            self.phase = "stable"

    def _stable_phase(self):
        """Normal operation with realistic fluctuations."""
        self.oil_temp = smooth_walk(self.oil_temp, self._base_oil + self._oil_drift, rate=0.02, noise_scale=0.04)
        self.vibration = abs(self._base_vib + noise(self._vib_noise_scale))
        self.flow = clamp(smooth_walk(self.flow, self._base_flow, rate=0.01, noise_scale=0.03), 0.5, 5.0)
        self.ambient = smooth_walk(self.ambient, self._base_ambient, rate=0.005, noise_scale=0.01)

        # Slow oil temp drift (warming up)
        self._oil_drift = min(self._oil_drift + random.uniform(-0.002, 0.008), self._max_oil_drift)

    def _anomaly_phase(self):
        """Sustained anomaly: multiple sequential readings showing fault."""
        if self._anomaly_type == "temp_rise":
            self.oil_temp = smooth_walk(self.oil_temp, self._anomaly_target_oil, rate=0.08, noise_scale=0.1)
            self.vibration = abs(self._base_vib + noise(self._vib_noise_scale * 1.3))
            self.flow = smooth_walk(self.flow, self._base_flow * 0.7, rate=0.05, noise_scale=0.05)
        elif self._anomaly_type == "vib_spike":
            self.oil_temp = smooth_walk(self.oil_temp, self._base_oil + self._oil_drift, rate=0.02, noise_scale=0.05)
            self.vibration = abs(smooth_walk(self.vibration, self._anomaly_target_vib, rate=0.1, noise_scale=0.4))
            self.flow = smooth_walk(self.flow, self._base_flow * 0.85, rate=0.03, noise_scale=0.04)
        elif self._anomaly_type == "combined":
            self.oil_temp = smooth_walk(self.oil_temp, self._anomaly_target_oil, rate=0.06, noise_scale=0.08)
            self.vibration = abs(smooth_walk(self.vibration, self._anomaly_target_vib, rate=0.08, noise_scale=0.5))
            self.flow = smooth_walk(self.flow, 1.0, rate=0.04, noise_scale=0.05)

    def _recovery_phase(self):
        """Return to normal after anomaly."""
        self.oil_temp = smooth_walk(self.oil_temp, self._base_oil + 0.5, rate=0.03, noise_scale=0.04)
        self.vibration = abs(smooth_walk(self.vibration, self._base_vib, rate=0.05, noise_scale=self._vib_noise_scale))
        self.flow = smooth_walk(self.flow, self._base_flow, rate=0.04, noise_scale=0.03)

    def _shutdown_phase(self):
        """Last 5-10 rows: values declining."""
        self.flow = smooth_walk(self.flow, 0.0, rate=0.15, noise_scale=0.02)
        self.vibration = abs(smooth_walk(self.vibration, 0.3, rate=0.08, noise_scale=0.15))
        self.oil_temp = smooth_walk(self.oil_temp, self.oil_temp - 0.05, rate=0.01, noise_scale=0.02)

    def _compute_health(self):
        penalty = 0
        if self.flow < 3.5:
            penalty += min(30, (3.5 - self.flow) * 30)
        if self.vibration > 3.0:
            penalty += min(35, ((self.vibration - 3.0) / 1.0) * 35)
        if self.oil_temp > 36:
            penalty += min(35, ((self.oil_temp - 36) / 5) * 35)
        self.health = max(0, round(100 - penalty))

    def _compute_ml_status(self):
        """Rule-based ML status simulation consistent with original data patterns."""
        # Temperature ML
        if self.oil_temp > 42:
            temp_status = "FAILURE"
        elif self.oil_temp > 38:
            temp_status = "WARNING"
        elif abs(self.oil_temp - self._prev_oil) > 0.15:
            temp_status = random.choice(["FAILURE", "NORMAL", "NORMAL"])
        else:
            temp_status = "NORMAL"

        # Vibration ML
        if self.vibration > 12:
            vib_status = "FAILURE"
        elif self.vibration > 9.5:
            vib_status = random.choice(["WARNING", "NORMAL"])
        else:
            vib_status = "NORMAL"

        failure = (temp_status == "FAILURE" or vib_status == "FAILURE" or
                   (temp_status == "WARNING" and vib_status == "WARNING"))

        return vib_status, temp_status, "YES" if failure else "NO"

    def generate(self):
        self._configure_scenario()
        rows = []

        for i in range(self.duration):
            self.row = i
            self._prev_oil = self.oil_temp

            # Determine current phase
            if i < self._startup_len:
                self.phase = "startup"
            elif i >= self.duration - self._shutdown_len:
                self.phase = "shutdown"
            elif self._anomaly_start <= i < self._anomaly_end:
                self.phase = "anomaly"
            elif self._anomaly_end <= i < self._anomaly_end + 10:
                self.phase = "recovery"
            else:
                self.phase = "stable"

            # Execute phase logic
            if self.phase == "startup":
                self._startup_phase()
            elif self.phase == "stable":
                self._stable_phase()
            elif self.phase == "anomaly":
                self._anomaly_phase()
            elif self.phase == "recovery":
                self._recovery_phase()
            elif self.phase == "shutdown":
                self._shutdown_phase()

            # Occasional single-row noise spike (NOT a fault)
            if self.phase == "stable" and random.random() < 0.03:
                self.vibration += random.uniform(2.0, 4.0)

            # Clamp to physical limits
            self.oil_temp = clamp(self.oil_temp, 0, 85)
            self.vibration = clamp(abs(self.vibration), 0, 20)
            self.flow = clamp(self.flow, 0, 30)
            self.ambient = clamp(self.ambient, 20, 50)

            self._compute_health()
            vib_s, temp_s, fail_s = self._compute_ml_status()

            rows.append([
                format_ts(self.ts),
                "HARDWARE",
                round(self.oil_temp, 1),
                round(self.vibration, 3),
                round(self.flow, 2),
                round(self.ambient, 1),
                self.health,
                vib_s,
                temp_s,
                fail_s
            ])

            self.ts += timedelta(seconds=1)

        return rows

    def _configure_scenario(self):
        if self.scenario == "normal_warm":
            self._base_oil = random.uniform(30.5, 32.0)
            self._base_vib = random.uniform(5.0, 7.5)
            self._vib_noise_scale = random.uniform(1.2, 2.0)
            self._base_flow = random.uniform(1.5, 2.5)
            self._base_ambient = random.uniform(32.5, 34.0)
            self._oil_drift = 0.0
            self._max_oil_drift = random.uniform(0.5, 1.5)
            self._startup_len = random.randint(4, 7)
            self._shutdown_len = random.randint(5, 10)
            self._anomaly_start = self.duration  # no anomaly
            self._anomaly_end = self.duration
            self._anomaly_type = None
            self._anomaly_target_oil = 0
            self._anomaly_target_vib = 0

        elif self.scenario == "normal_cool":
            self._base_oil = random.uniform(28.0, 30.0)
            self._base_vib = random.uniform(3.5, 5.5)
            self._vib_noise_scale = random.uniform(0.8, 1.5)
            self._base_flow = random.uniform(2.0, 3.5)
            self._base_ambient = random.uniform(28.0, 31.0)
            self._oil_drift = 0.0
            self._max_oil_drift = random.uniform(0.3, 0.8)
            self._startup_len = random.randint(3, 6)
            self._shutdown_len = random.randint(4, 8)
            self._anomaly_start = self.duration
            self._anomaly_end = self.duration
            self._anomaly_type = None
            self._anomaly_target_oil = 0
            self._anomaly_target_vib = 0

        elif self.scenario == "temp_fault":
            self._base_oil = random.uniform(31.0, 33.0)
            self._base_vib = random.uniform(5.5, 7.0)
            self._vib_noise_scale = random.uniform(1.3, 2.0)
            self._base_flow = random.uniform(1.5, 2.2)
            self._base_ambient = random.uniform(33.0, 35.0)
            self._oil_drift = 0.0
            self._max_oil_drift = random.uniform(2.0, 5.0)
            self._startup_len = random.randint(4, 6)
            self._shutdown_len = random.randint(5, 10)
            mid = self.duration // 2
            self._anomaly_start = mid + random.randint(-15, 5)
            self._anomaly_end = self._anomaly_start + random.randint(15, 30)
            self._anomaly_type = "temp_rise"
            self._anomaly_target_oil = random.uniform(42.0, 55.0)
            self._anomaly_target_vib = 0

        elif self.scenario == "vib_fault":
            self._base_oil = random.uniform(30.0, 32.0)
            self._base_vib = random.uniform(5.0, 7.0)
            self._vib_noise_scale = random.uniform(1.5, 2.2)
            self._base_flow = random.uniform(1.5, 2.5)
            self._base_ambient = random.uniform(32.0, 34.0)
            self._oil_drift = 0.0
            self._max_oil_drift = random.uniform(0.5, 1.0)
            self._startup_len = random.randint(4, 7)
            self._shutdown_len = random.randint(5, 8)
            mid = self.duration // 2
            self._anomaly_start = mid + random.randint(-10, 10)
            self._anomaly_end = self._anomaly_start + random.randint(12, 25)
            self._anomaly_type = "vib_spike"
            self._anomaly_target_oil = 0
            self._anomaly_target_vib = random.uniform(11.0, 16.0)

        elif self.scenario == "combined_fault":
            self._base_oil = random.uniform(31.0, 33.0)
            self._base_vib = random.uniform(6.0, 8.0)
            self._vib_noise_scale = random.uniform(1.5, 2.5)
            self._base_flow = random.uniform(1.2, 2.0)
            self._base_ambient = random.uniform(33.0, 36.0)
            self._oil_drift = 0.0
            self._max_oil_drift = random.uniform(3.0, 6.0)
            self._startup_len = random.randint(4, 6)
            self._shutdown_len = random.randint(6, 12)
            mid = self.duration // 2
            self._anomaly_start = mid + random.randint(-10, 5)
            self._anomaly_end = self._anomaly_start + random.randint(20, 40)
            self._anomaly_type = "combined"
            self._anomaly_target_oil = random.uniform(45.0, 60.0)
            self._anomaly_target_vib = random.uniform(12.0, 18.0)

        elif self.scenario == "stable_long":
            self._base_oil = random.uniform(31.0, 32.5)
            self._base_vib = random.uniform(4.5, 6.5)
            self._vib_noise_scale = random.uniform(1.0, 1.8)
            self._base_flow = random.uniform(1.6, 2.4)
            self._base_ambient = random.uniform(32.0, 34.5)
            self._oil_drift = 0.0
            self._max_oil_drift = random.uniform(0.3, 0.6)
            self._startup_len = random.randint(3, 5)
            self._shutdown_len = random.randint(4, 7)
            self._anomaly_start = self.duration
            self._anomaly_end = self.duration
            self._anomaly_type = None
            self._anomaly_target_oil = 0
            self._anomaly_target_vib = 0

        elif self.scenario == "gradual_degradation":
            self._base_oil = random.uniform(30.5, 31.5)
            self._base_vib = random.uniform(5.0, 6.0)
            self._vib_noise_scale = random.uniform(1.2, 1.8)
            self._base_flow = random.uniform(1.8, 2.5)
            self._base_ambient = random.uniform(32.0, 33.5)
            self._oil_drift = 0.0
            self._max_oil_drift = random.uniform(6.0, 10.0)  # will drift high over time
            self._startup_len = random.randint(4, 6)
            self._shutdown_len = random.randint(5, 10)
            # No sudden anomaly — the drift itself IS the anomaly
            self._anomaly_start = self.duration
            self._anomaly_end = self.duration
            self._anomaly_type = None
            self._anomaly_target_oil = 0
            self._anomaly_target_vib = 0


HEADER = ["Timestamp", "Mode", "Oil_Temp_C", "Vibration_g", "Flow_Lmin",
          "Ambient_Temp_C", "Health_Index", "ML_Vib_Status", "ML_Temp_Status", "ML_Failure_Risk"]

def write_csv(filename, rows):
    filepath = os.path.join(OUTPUT_DIR, filename)
    with open(filepath, 'w', newline='\r\n') as f:
        f.write(",".join(HEADER) + "\r\n")
        for row in rows:
            f.write(",".join(str(v) for v in row) + "\r\n")
    print(f"  Written {len(rows)} rows -> {filename}")


# ============================================================
# GENERATE FILES
# ============================================================

def main():
    print("Generating synthetic datasets...\n")

    # --- File 1: Normal warm operation (~280 rows) ---
    base_time = datetime(2026, 5, 14, 9, 30, 0)
    s1 = MotorSession(base_time, 140, "normal_warm")
    s2 = MotorSession(base_time + timedelta(minutes=3), 140, "stable_long")
    write_csv("synthetic_data_1.csv", s1.generate() + s2.generate())

    # --- File 2: Temperature fault session (~300 rows) ---
    base_time = datetime(2026, 5, 14, 14, 15, 0)
    s1 = MotorSession(base_time, 150, "normal_cool")
    s2 = MotorSession(base_time + timedelta(minutes=3), 150, "temp_fault")
    write_csv("synthetic_data_2.csv", s1.generate() + s2.generate())

    # --- File 3: Vibration fault + recovery (~280 rows) ---
    base_time = datetime(2026, 5, 15, 7, 0, 0)
    s1 = MotorSession(base_time, 100, "stable_long")
    s2 = MotorSession(base_time + timedelta(minutes=2), 180, "vib_fault")
    write_csv("synthetic_data_3.csv", s1.generate() + s2.generate())

    # --- File 4: Combined fault scenario (~250 rows) ---
    base_time = datetime(2026, 5, 15, 18, 45, 0)
    s1 = MotorSession(base_time, 120, "normal_warm")
    s2 = MotorSession(base_time + timedelta(minutes=2), 130, "combined_fault")
    write_csv("synthetic_data_4.csv", s1.generate() + s2.generate())

    # --- File 5: Gradual degradation (~250 rows) ---
    base_time = datetime(2026, 5, 16, 11, 0, 0)
    s1 = MotorSession(base_time, 250, "gradual_degradation")
    write_csv("synthetic_data_5.csv", s1.generate())

    print("\nDone! Total synthetic rows generated across 5 files.")


if __name__ == "__main__":
    main()
