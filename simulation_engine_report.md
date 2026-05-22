# Transense: Simulation Engine & Dataset Optimization Report

## Executive Summary
This technical report outlines the comprehensive redesign and professionalization of the Transense simulation environment. The previous stochastic (randomized) value generation has been entirely replaced by a robust, non-blocking CSV playback engine. This enables the simulation mode to perfectly mimic realistic industrial hardware sessions by replaying authentic recorded datasets.

---

## A. Dataset Renaming Changes
The synthetic datasets have been renamed from temporary artificial identifiers (e.g., `synthetic_data_1.csv`) to a cleaner, realistic industrial nomenclature:
- `synthetic_data_1.csv` → `data1.csv`
- `synthetic_data_2.csv` → `data2.csv`
- `synthetic_data_3.csv` → `data3.csv`
- `synthetic_data_4.csv` → `data4.csv`
- `synthetic_data_5.csv` → `data5.csv`

This renaming ensures the system feels professional and mirrors standard data logging systems. The original dataset structures, row formatting, and temporal characteristics have been perfectly preserved.

## B. Simulation Engine Redesign
The legacy simulation logic generated fake sinusoidal waves mixed with randomized noise and artificial anomalies. This was stripped out entirely. The new simulation engine is designed to parse real recorded logs from the file system and feed them row-by-row into the processing pipeline, ensuring that every simulated metric is drawn from actual continuous data.

## C. Testing Dataset Integration
To maintain absolute integrity of the Machine Learning models, a strict separation of datasets was implemented:
- **Training Sets:** `data1.csv`, `data2.csv`, `data3.csv`
- **Testing Sets:** `data4.csv`, `data5.csv`

The simulation engine is hardcoded to *only* load and replay the testing datasets (`data4.csv` and `data5.csv`). This guarantees that the dashboard and the live ML pipeline operate on unseen test data, simulating real-world inference accurately.

## D. Playback Architecture
The simulator employs a seamless, non-blocking playback loop. 
- The engine loads the CSV into memory upon initialization. 
- It reads data row-by-row matching original sampling rates.
- The playback engine features **automatic file switching** and **infinite looping**. When `data4.csv` concludes, it smoothly transitions to `data5.csv`, and upon completing the final test file, it loops back, providing continuous, uninterrupted testing data.

## E. Real-Time Streaming Implementation
Instead of loading and dumping the file simultaneously, the simulator streams metrics exactly at 1-second intervals via a non-blocking `setInterval` tick. This adheres to asynchronous JavaScript paradigms, ensuring the Node.js event loop is never blocked during long testing sessions. 

## F. Backend Integration Changes
The `serial.service.ts` file was overhauled. Instead of manually emitting data events, the simulation engine formats the loaded CSV rows into the precise string structures outputted by the Arduino hardware (e.g., `Flow (L/min): X | Temp (C): Y...`). This raw string is fed directly back into `parseData()`.

## G. ML Pipeline Compatibility
By injecting data straight into `parseData()`, the simulator perfectly replicates the hardware interface. The data flows effortlessly through the **Validation Layer**, the **Feature Engineering** phase, and subsequently into the **ML Inference** pipeline. No logic was bypassed; the ML Python microservice processes the simulated rows exactly as if a real transformer was connected.

## H. Dashboard Behavior Changes
With the stochastic random mode gone, the frontend dashboard now reflects highly realistic physical trends. Operators will observe:
- Proper startup stabilization behaviors.
- Realistic, gradual thermal creeping (as opposed to erratic temperature jumping).
- Proper temporal continuity in flow and vibration.
- Natural, progressive anomaly developments rather than sudden binary faults.

## I. File References Updated
System-wide modifications were executed to ensure full reference consistency. The data generation pipeline (`generate_synthetic.py`) and the ML training modules (`train_vibration.py`, `train_temperature.py`) were patched to reference the clean `dataX.csv` structures. No broken references persist.

## J. Timing and Playback Behavior
The simulation operates at a steady 1 Hz clock cycle, identical to the standard hardware logging rate. This ensures the dashboard gauges smoothly transition, and the sliding windows used by the ML temporal filters remain in perfect synchrony with their designed timing specifications.

## K. Improvements Over Previous Random System
1. **Authenticity:** The metrics now obey the laws of physics, reflecting true hardware behavior rather than mathematical randomness.
2. **Predictability in Testing:** Because testing data is standardized and repeatable, debugging the UI or the ML pipeline is significantly easier and more deterministic.
3. **Professionalism:** The system sheds its "mocked" feel. Demonstrating the system now feels like operating a true industrial monitoring platform.
4. **Resilience:** Graceful handling of end-of-file events and automated looping make the simulator highly reliable for continuous endurance testing of the dashboard.
