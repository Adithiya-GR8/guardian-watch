#include <Wire.h>
#include <MPU6050.h>
#include <OneWire.h>
#include <DallasTemperature.h>

/**
 * REFACTORED SKETCH - Transense V3
 * Features: Non-blocking vibration sampling & Atomic flow count.
 */

// MPU
MPU6050 mpu;

// FLOW SENSOR - Must be volatile as it's used in interrupts
volatile uint16_t flowPulseCount = 0; 
float flowRate = 0;
unsigned long lastFlowTime = 0;

// DS18B20
#define ONE_WIRE_BUS 3
OneWire oneWire(ONE_WIRE_BUS);
DallasTemperature ds18b20(&oneWire);
float tempDS = 0;

// LM35
#define LM35_PIN A0
float tempLM35 = 0;

// Timing & Control
unsigned long lastTempRead = 0;
unsigned long lastLM35Read = 0;
unsigned long lastVibeSampleTime = 0;
unsigned long lastSerialPrint = 0;

// Vibration Variables
const int sampleCount = 100;
int currentSamples = 0;
float runningSumSquares = 0;
float vibrationRMS = 0;

// Interrupt Service Routine (ISR)
void flowPulse() {
  flowPulseCount++;
}

void setup() {
  Serial.begin(115200);
  Wire.begin();

  // MPU setup
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("MPU connection failed!");
    while (1);
  }

  // Flow sensor setup (Pin 2)
  pinMode(2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), flowPulse, RISING);

  // Temperature sensors
  ds18b20.begin();
  pinMode(LM35_PIN, INPUT);

  Serial.println("Transense Online...");
}

void loop() {
  unsigned long currentMillis = millis();

  // ========= 1. VIBRATION SAMPLING (Non-Blocking) =========
  if (currentSamples < sampleCount) {
    if (currentMillis - lastVibeSampleTime >= 5) {
      int16_t rawAx, rawAy, rawAz;
      mpu.getAcceleration(&rawAx, &rawAy, &rawAz);

      // Math: Convert to G then m/s^2
      float ax = (rawAx / 16384.0) * 9.81;
      float ay = (rawAy / 16384.0) * 9.81;
      float az = (rawAz / 16384.0) * 9.81;

      float magnitude = sqrt(ax * ax + ay * ay + az * az);
      float vibration = magnitude - 9.81;

      runningSumSquares += (vibration * vibration);
      currentSamples++;
      lastVibeSampleTime = currentMillis;
    }
  } else {
    vibrationRMS = sqrt(runningSumSquares / sampleCount);
    runningSumSquares = 0;
    currentSamples = 0;
  }

  // ========= 2. FLOW CALCULATION (Atomic) =========
  if (currentMillis - lastFlowTime >= 1000) {
    // PROTECTED BLOCK: Briefly disable interrupts to grab the count
    noInterrupts();
    uint16_t pulses = flowPulseCount;
    flowPulseCount = 0;
    interrupts();

    // Standard conversion for YF-S201 (Pulses per second / 7.5)
    flowRate = (float)pulses / 7.5; 
    lastFlowTime = currentMillis;
  }

  // ========= 3. OIL TEMP (Every 2s) =========
  if (currentMillis - lastTempRead >= 2000) {
    ds18b20.requestTemperatures();
    tempDS = ds18b20.getTempCByIndex(0);
    lastTempRead = currentMillis;
  }

  // ========= 4. ATMOSPHERIC TEMP (Every 2s) =========
  if (currentMillis - lastLM35Read >= 2000) {
    int sensorValue = analogRead(LM35_PIN);
    float voltage = sensorValue * (5.0 / 1023.0);
    tempLM35 = voltage * 100.0;
    lastLM35Read = currentMillis;
  }

  // ========= 5. SERIAL OUTPUT (Every 500ms) =========
  if (currentMillis - lastSerialPrint >= 500) {
    Serial.println("--- SENSOR SUMMARY ---");
    
    Serial.print("Vibe RMS: ");
    Serial.print(vibrationRMS, 3);
    Serial.println(" m/s^2");

    Serial.print("Flow    : ");
    Serial.print(flowRate, 2);
    Serial.println(" L/min");

    Serial.print("Oil Temp: ");
    Serial.print(tempDS, 1);
    Serial.println(" C");

    Serial.print("Air Temp: ");
    Serial.print(tempLM35, 1);
    Serial.println(" C");

    Serial.println("----------------------\n");
    lastSerialPrint = currentMillis;
  }
}