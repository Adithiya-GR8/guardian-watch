#include <Wire.h>
#include <MPU6050.h>
#include <OneWire.h>
#include <DallasTemperature.h>

/**
 * REFACTORED SKETCH - Guardian Watch
 * Non-blocking vibration sampling to prevent system freeze.
 */

// MPU
MPU6050 mpu;

// FLOW SENSOR
volatile int flowPulseCount = 0;
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

void flowPulse() {
  flowPulseCount++;
}

void setup() {
  Serial.begin(115200);
  Wire.begin();

  // MPU setup
  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("MPU connection failed! Check wiring.");
    while (1);
  }

  // Flow sensor interrupt (Pin 2)
  pinMode(2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), flowPulse, RISING);

  // DS18B20
  ds18b20.begin();

  // LM35 pin
  pinMode(LM35_PIN, INPUT);

  Serial.println("System Initialized...");
}

void loop() {
  unsigned long currentMillis = millis();

  // ========= 1. VIBRATION SAMPLING (Non-Blocking) =========
  // We collect 1 sample every 5ms until we reach 100 samples
  if (currentSamples < sampleCount) {
    if (currentMillis - lastVibeSampleTime >= 5) {
      int16_t rawAx, rawAy, rawAz;
      mpu.getAcceleration(&rawAx, &rawAy, &rawAz);

      // Convert raw to m/s^2 (Standard 2g scale: 16384 LSB/g)
      float ax = (rawAx / 16384.0) * 9.81;
      float ay = (rawAy / 16384.0) * 9.81;
      float az = (rawAz / 16384.0) * 9.81;

      // Calculate Magnitude and subtract Gravity (9.81)
      float magnitude = sqrt(ax * ax + ay * ay + az * az);
      float vibration = magnitude - 9.81;

      runningSumSquares += (vibration * vibration);
      currentSamples++;
      lastVibeSampleTime = currentMillis;
    }
  } else {
    // 100 samples reached: Calculate Final RMS and Reset
    vibrationRMS = sqrt(runningSumSquares / sampleCount);
    runningSumSquares = 0;
    currentSamples = 0;
  }

  // ========= 2. FLOW CALCULATION (Every 1s) =========
  if (currentMillis - lastFlowTime >= 1000) {
    flowRate = flowPulseCount / 7.5; // Standard YF-S201 factor
    flowPulseCount = 0;
    lastFlowTime = currentMillis;
  }

  // ========= 3. DS18B20 OIL TEMP (Every 2s) =========
  if (currentMillis - lastTempRead >= 2000) {
    ds18b20.requestTemperatures();
    tempDS = ds18b20.getTempCByIndex(0);
    lastTempRead = currentMillis;
  }

  // ========= 4. LM35 ATMOSPHERIC TEMP (Every 2s) =========
  if (currentMillis - lastLM35Read >= 2000) {
    int sensorValue = analogRead(LM35_PIN);
    float voltage = sensorValue * (5.0 / 1023.0);
    tempLM35 = voltage * 100.0;
    lastLM35Read = currentMillis;
  }

  // ========= 5. SERIAL OUTPUT (Every 500ms) =========
  if (currentMillis - lastSerialPrint >= 500) {
    Serial.println("------ GUARDIAN DATA ------");
    
    Serial.print("Vibration RMS: ");
    Serial.print(vibrationRMS, 4); 
    Serial.println(" m/s^2");

    Serial.print("Flow Rate    : ");
    Serial.print(flowRate);
    Serial.println(" L/min");

    Serial.print("Oil Temp     : ");
    Serial.print(tempDS);
    Serial.println(" C");

    Serial.print("Atmos Temp   : ");
    Serial.print(tempLM35);
    Serial.println(" C");

    Serial.println("---------------------------\n");
    lastSerialPrint = currentMillis;
  }
}