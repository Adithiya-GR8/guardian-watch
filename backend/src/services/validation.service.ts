import { SerialData } from "./serial.service.js";

/**
 * Guardian Watch — Data Validation Layer
 * ========================================
 * Prevents garbage input from reaching the ML pipeline.
 * Catches: NaN, DS18B20 errors (-127/85°C), out-of-range,
 * impossible single-reading spikes (confirm-or-discard pattern).
 */

// Physical limits for each sensor
const RULES = {
  oilTemp:    { min: -10,  max: 150,  maxJump: 15 },  // °C per reading
  vibration:  { min: 0,    max: 50,   maxJump: 12 },   // m/s²
  flow:       { min: 0,    max: 15,   maxJump: 5 },    // L/min
  ambientTemp:{ min: -20,  max: 80,   maxJump: 10 },   // °C
  DS18B20_ERRORS: [-127, 85],                           // known error values
};

class ValidationService {
  private lastValid = { oilTemp: NaN, vibration: NaN, flow: NaN, ambientTemp: NaN };
  private tentative: SerialData | null = null;
  private stats = { total: 0, passed: 0, rejected: 0, spikesBlocked: 0 };

  /**
   * Validate a sensor reading. Returns cleaned data or null if invalid.
   * Uses a confirm-or-discard pattern for spike detection:
   *   1. If a reading jumps abnormally → hold it as "tentative", return null
   *   2. Next reading: if it confirms the new range → accept both; if it
   *      returns to normal → the tentative was a spike, discard it.
   */
  public validate(data: SerialData): SerialData | null {
    this.stats.total++;

    // --- Phase 1: Hard rejection (NaN, null, known errors) ---
    if (data.oilTemp == null || data.vibration == null || data.flow == null ||
        isNaN(data.oilTemp) || isNaN(data.vibration) || isNaN(data.flow)) {
      this.reject("NaN/null detected");
      return null;
    }

    if (RULES.DS18B20_ERRORS.includes(data.oilTemp)) {
      this.reject(`DS18B20 error value: ${data.oilTemp}°C`);
      return null;
    }

    // --- Phase 2: Range check ---
    if (!this.inRange(data.oilTemp, RULES.oilTemp) ||
        !this.inRange(data.vibration, RULES.vibration) ||
        !this.inRange(data.flow, RULES.flow)) {
      this.reject(`Out of range: OT=${data.oilTemp} VIB=${data.vibration} FL=${data.flow}`);
      return null;
    }

    // Validate ambient (optional — replace invalid with last-known-good)
    let cleanAmbient = data.ambientTemp;
    if (cleanAmbient !== undefined && (isNaN(cleanAmbient) || !this.inRange(cleanAmbient, RULES.ambientTemp))) {
      cleanAmbient = isNaN(this.lastValid.ambientTemp) ? undefined : this.lastValid.ambientTemp;
    }

    const cleaned: SerialData = { ...data, ambientTemp: cleanAmbient };

    // --- Phase 3: Spike detection (confirm-or-discard) ---
    if (!isNaN(this.lastValid.oilTemp)) {
      const jumped =
        Math.abs(cleaned.oilTemp - this.lastValid.oilTemp) > RULES.oilTemp.maxJump ||
        Math.abs(cleaned.vibration - this.lastValid.vibration) > RULES.vibration.maxJump ||
        Math.abs(cleaned.flow - this.lastValid.flow) > RULES.flow.maxJump;

      if (jumped && this.tentative === null) {
        // First spike — hold as tentative, don't emit yet
        this.tentative = cleaned;
        this.stats.spikesBlocked++;
        return null;
      }

      if (this.tentative !== null) {
        // We had a tentative reading. Does current reading confirm the new level?
        const confirmsTemp = Math.abs(cleaned.oilTemp - this.tentative.oilTemp) < RULES.oilTemp.maxJump;
        const confirmsVib  = Math.abs(cleaned.vibration - this.tentative.vibration) < RULES.vibration.maxJump;

        if (confirmsTemp && confirmsVib) {
          // Confirmed: the jump was real (sustained change, not a spike)
          this.updateLast(cleaned);
          this.tentative = null;
          this.stats.passed++;
          return cleaned;
        } else {
          // Denied: tentative was a spike, discard it, continue with current
          this.stats.spikesBlocked++;
          this.tentative = null;
          // Fall through to accept current reading normally
        }
      }
    }

    // --- Phase 4: Accept ---
    this.updateLast(cleaned);
    this.tentative = null;
    this.stats.passed++;
    return cleaned;
  }

  private inRange(val: number, rule: { min: number; max: number }): boolean {
    return val >= rule.min && val <= rule.max;
  }

  private updateLast(data: SerialData): void {
    this.lastValid.oilTemp = data.oilTemp;
    this.lastValid.vibration = data.vibration;
    this.lastValid.flow = data.flow;
    if (data.ambientTemp !== undefined) this.lastValid.ambientTemp = data.ambientTemp;
  }

  private reject(reason: string): void {
    this.stats.rejected++;
    if (this.stats.rejected <= 10 || this.stats.rejected % 50 === 0) {
      console.log(`[VALIDATE] Rejected #${this.stats.rejected}: ${reason}`);
    }
  }

  public getStats() { return { ...this.stats }; }
}

export const validationService = new ValidationService();
