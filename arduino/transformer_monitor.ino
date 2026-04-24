#include <Wire.h>
#include <MPU6050.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <DHT.h>

/**
 * UPDATED SKETCH - Guardian Watch
 * Optimized for sensitivity and proper math.
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

// DHT22
#define DHTPIN 4
#define DHTTYPE DHT22
DHT dht(DHTPIN, DHTTYPE);
float tempDHT = 0, humidity = 0;

// Timing
unsigned long lastTempRead = 0;
unsigned long lastDHTRead = 0;

// Vibration
const int sampleCount = 100;
float vibrationRMS = 0;

void flowPulse() {
  flowPulseCount++;
}

void setup() {
  Serial.begin(115200);
  Wire.begin();

  mpu.initialize();
  if (!mpu.testConnection()) {
    Serial.println("MPU failed!");
    while (1);
  }

  pinMode(2, INPUT_PULLUP);
  attachInterrupt(digitalPinToInterrupt(2), flowPulse, RISING);

  ds18b20.begin();
  dht.begin();

  Serial.println("System Ready");
}

void loop() {

  // ========= VIBRATION (PRIORITY) =========
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

    delay(5);  // keep stable sampling
  }

  vibrationRMS = sqrt(sumSquares / sampleCount);

  // ========= FLOW =========
  if (millis() - lastFlowTime >= 1000) {
    flowRate = flowPulseCount / 7.5;
    flowPulseCount = 0;
    lastFlowTime = millis();
  }

  // ========= DS18B20 (every 2 sec) =========
  if (millis() - lastTempRead >= 2000) {
    ds18b20.requestTemperatures();
    tempDS = ds18b20.getTempCByIndex(0);
    lastTempRead = millis();
  }

  // ========= DHT22 (every 2 sec) =========
  if (millis() - lastDHTRead >= 2000) {
    tempDHT = dht.readTemperature();
    humidity = dht.readHumidity();
    lastDHTRead = millis();
  }

  // ========= OUTPUT =========
  Serial.println("------ DATA ------");

  Serial.print("Vibration RMS: ");
  Serial.println(vibrationRMS);

  Serial.print("Flow Rate: ");
  Serial.println(flowRate);

  Serial.print("DS18B20 Temp: ");
  Serial.println(tempDS);

  Serial.print("DHT Temp: ");
  Serial.println(tempDHT);

  Serial.print("Humidity: ");
  Serial.println(humidity);

  Serial.println("------------------\n");

  delay(300);
}
