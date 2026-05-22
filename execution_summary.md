# Transense — ML Rewrite Execution Summary

## Status: COMPLETE

All code has been written, models trained, and integration verified.

---

## Files Created

| File | Purpose |
|------|---------|
| [utils.py](file:///d:/Sem-4/edi/guardian-watch/models/utils.py) | Shared CSV parser + feature engineering |
| [train_temperature.py](file:///d:/Sem-4/edi/guardian-watch/models/temperature/train_temperature.py) | Temperature model training script |
| [train_vibration.py](file:///d:/Sem-4/edi/guardian-watch/models/vibration/train_vibration.py) | Vibration model training script |

## Files Modified

| File | Changes |
|------|---------|
| [app.py](file:///d:/Sem-4/edi/guardian-watch/python/app.py) | Complete rewrite — removed TensorFlow, both models now Isolation Forest |
| [ml.service.ts](file:///d:/Sem-4/edi/guardian-watch/backend/src/services/ml.service.ts) | Complete rewrite — local feature computation + 3-of-5 persistence filter |
| [requirements.txt](file:///d:/Sem-4/edi/guardian-watch/python/requirements.txt) | Removed `tensorflow` dependency |

## Files Deleted

| File | Reason |
|------|--------|
| `models/vibration/vibration_model.h5` | LSTM Autoencoder replaced by Isolation Forest |
| `models/vibration/vibration_threshold.pkl` | Threshold no longer needed |

## Files Unchanged (confirmed compatible)

`serial.service.ts`, `dataProcessor.ts`, `index.ts`, `thresholds.ts`, `socket.ts`, `logger.service.ts`, all frontend components.

---

## Training Results

### Temperature Model

| Metric | Value |
|--------|-------|
| Training rows | 1,075 |
| Features | `oil_temp`, `rate_of_change`, `rolling_mean`, `rolling_std` |
| Contamination | 8.0% |
| Training anomaly rate | 8.0% (86/1075) |
| **Test anomaly rate** | **18.0% (87/482)** |
| Test score range | [-0.2377, 0.2165] |
| Normal mean score | 0.1840 |
| Anomaly mean score | -0.1371 |

### Vibration Model

| Metric | Value |
|--------|-------|
| Training rows | 1,075 |
| Features | `vibration`, `rate_of_change`, `rolling_mean`, `rms`, `rolling_std` |
| Contamination | 10.0% |
| Training anomaly rate | 10.0% (108/1075) |
| **Test anomaly rate** | **11.2% (54/482)** |
| Test score range | [-0.2451, 0.1459] |
| Normal mean score | 0.0937 |
| Anomaly mean score | -0.0779 |

## API Verification

| Endpoint | Input | Expected | Got |
|----------|-------|----------|-----|
| `GET /health` | — | Both LOADED | Both LOADED |
| `POST /predict/temperature` | Normal features `[31.2, 0, 31.15, 0.07]` | NORMAL | NORMAL (0.2153) |
| `POST /predict/temperature` | Fault features `[45.0, 1.5, 42.0, 3.5]` | ANOMALY | ANOMALY (-0.2022) |
| `POST /predict/vibration` | Normal features `[5.5, 0.1, 5.8, 6.0, 1.5]` | NORMAL | NORMAL (0.1382) |
| `POST /predict/vibration` | Fault features `[14.5, 2.0, 12.0, 13.5, 3.8]` | ANOMALY | ANOMALY (-0.2199) |

## TypeScript Compilation

`ml.service.ts` compiles with **zero errors**. The only TS error in the backend is a pre-existing `import.meta` issue in `logger.service.ts` (unrelated).
