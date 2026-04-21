/**
 * GUARDIAN WATCH - Transformer Health Monitor
 * Complete Sensor Sketch for Arduino Uno
 * 
 * SENSOR CONNECTIONS:
 * -------------------
 * Flow Sensor (YF-S201):    Digital Pin 2 (Interrupt)
 * Oil Temp (DS18B20):       Digital Pin 3 (Data) + 4.7k resistor
 * Ambient Temp (DS18B20):   Digital Pin 4 (Data) + 4.7k resistor
 * Vibration (MPU6050):      I2C (SDA -> A4, SCL -> A5)
 */

#include <Wire.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <MPU6050.h>
#include <math.h>

// ================= FLOW SENSOR =================
#define FLOW_PIN 2
volatile int flowPulseCount = 0;
float flowRate = 0;
unsigned long lastFlowTime = 0;

void flowISR() {
  flowPulseCount++;
}

// ================= TEMPERATURE SENSORS =================
// Oil Temp on Pin 3
#define OIL_TEMP_PIN 3
OneWire oneWireOil(OIL_TEMP_PIN);
DallasTemperature oilTempSensor(&oneWireOil);

// Ambient Temp on Pin 4
#define AMB_TEMP_PIN 4
OneWire oneWireAmb(AMB_TEMP_PIN);
DallasTemperature ambTempSensor(&oneWireAmb);

// ================= MPU6050 VIBRATION =================
MPU6050 mpu;
int16_t ax, ay, az;
float prevMagnitude = 0;
float vibration = 0;

void setup() {
  Serial.begin(9600);

  // Flow sensor setup
  pinMode(FLOW_PIN, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(FLOW_PIN), flowISR, RISING);

  // Temperature sensors setup
  oilTempSensor.begin();
  ambTempSensor.begin();

  // MPU6050 I2C setup
  Wire.begin();
  mpu.initialize();

  if (!mpu.testConnection()) {
    // Note: If this fails, make sure A4 and A5 are connected
    Serial.println("MPU6050 Connection Failed!");
  }

  Serial.println("System Ready - Starting Telemetry...");
}

void loop() {
  // ---------- 1. CALCULATE FLOW ----------
  if (millis() - lastFlowTime >= 1000) {
    detachInterrupt(digitalPinToInterrupt(FLOW_PIN));
    flowRate = flowPulseCount / 7.5; // YF-S201 formula (L/min)
    flowPulseCount = 0;
    lastFlowTime = millis();
    attachInterrupt(digitalPinToInterrupt(FLOW_PIN), flowISR, RISING);
  }

  // ---------- 2. READ TEMPERATURES ----------
  oilTempSensor.requestTemperatures();
  float oilTemp = oilTempSensor.getTempCByIndex(0);

  ambTempSensor.requestTemperatures();
  float ambTemp = ambTempSensor.getTempCByIndex(0);

  // ---------- 3. CALCULATE VIBRATION ----------
  mpu.getAcceleration(&ax, &ay, &az);
  float ax_g = ax / 16384.0;
  float ay_g = ay / 16384.0;
  float az_g = az / 16384.0;
  
  float magnitude = sqrt(ax_g * ax_g + ay_g * ay_g + az_g * az_g);
  magnitude = abs(magnitude - 1.0); // Remove gravity offset
  
  vibration = abs(magnitude - prevMagnitude);
  prevMagnitude = magnitude;

  // ---------- 4. OUTPUT TO SERIAL (CRITICAL FORMAT) ----------
  // Format required by Node.js backend:
  // Flow (L/min): X | Temp (C): X | Vibration (g): X | Ambient (C): X
  
  Serial.print("Flow (L/min): ");
  Serial.print(flowRate);

  Serial.print(" | Temp (C): ");
  Serial.print(oilTemp);

  Serial.print(" | Vibration (g): ");
  Serial.print(vibration);

  Serial.print(" | Ambient (C): ");
  Serial.print(ambTemp);

  Serial.println(); // Send the newline to complete the packet

  delay(500); // 2Hz Telemetry rate
}
