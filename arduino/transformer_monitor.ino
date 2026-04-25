#include <Wire.h>
#include <MPU6050.h>
#include <OneWire.h>
#include <DallasTemperature.h>

/**
 * UPDATED SKETCH - Guardian Watch
 * DHT22 replaced with LM35 for Atmospheric monitoring.
 * Re-mapped to support Oil Temp and Atmospheric Temp labels.
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

// Timing
unsigned long lastTempRead = 0;
unsigned long lastLM35Read = 0;

// Vibration
const int sampleCount = 100;
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
    Serial.println("MPU failed!");
    while (1);
  }

  // Flow sensor interrupt
  pinMode(2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), flowPulse, RISING);

  // DS18B20
  ds18b20.begin();

  // LM35 pin
  pinMode(LM35_PIN, INPUT);

  Serial.println("System Ready");
}

void loop() {

  // ========= VIBRATION =========
  float sumSquares = 0;

  for (int i = 0; i < sampleCount; i++) {
    int16_t rawAx, rawAy, rawAz;
    mpu.getAcceleration(&rawAx, &rawAy, &rawAz);

    float ax = (rawAx / 16384.0) * 9.81;
    float ay = (rawAy / 16384.0) * 9.81;
    float az = (rawAz / 16384.0) * 9.81;

    float magnitude = sqrt(ax * ax + ay * ay + az * az);
    float vibration = magnitude - 9.81;

    sumSquares += vibration * vibration;

    delay(5);
  }

  vibrationRMS = sqrt(sumSquares / sampleCount);

  // ========= FLOW =========
  if (millis() - lastFlowTime >= 1000) {
    flowRate = flowPulseCount / 7.5;
    flowPulseCount = 0;
    lastFlowTime = millis();
  }

  // ========= DS18B20 =========
  if (millis() - lastTempRead >= 2000) {
    ds18b20.requestTemperatures();
    tempDS = ds18b20.getTempCByIndex(0);
    lastTempRead = millis();
  }

  // ========= LM35 =========
  if (millis() - lastLM35Read >= 2000) {
    int sensorValue = analogRead(LM35_PIN);

    float voltage = sensorValue * (5.0 / 1023.0);
    tempLM35 = voltage * 100.0;

    lastLM35Read = millis();
  }

  // ========= OUTPUT =========
  Serial.println("------ DATA ------");

  Serial.print("Vibration RMS: ");
  Serial.println(vibrationRMS);

  Serial.print("Flow Rate: ");
  Serial.println(flowRate);

  Serial.print("Oil Temp: ");
  Serial.println(tempDS);

  Serial.print("Atmospheric Temp: ");
  Serial.println(tempLM35);

  Serial.println("------------------\n");

  delay(300);
}
