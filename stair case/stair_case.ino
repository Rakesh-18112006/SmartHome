/*
============================================================
Advanced Staircase Lighting System (Testing Mode)
ESP8266 + 4 Channels
State-Machine Architecture (Web Trigger Only)
============================================================
*/

#include <ArduinoJson.h>
#include <ArduinoOTA.h>
#include <EEPROM.h>
#include <ESP8266WiFi.h>
#include <PubSubClient.h>

// ---------------- PINS ----------------
#define CH1_PIN 4  // GPIO4  D2 (Step 1)
#define CH2_PIN 5  // GPIO5  D1 (Step 2)
#define CH3_PIN 12 // GPIO12 D6 (Step 3)
#define CH4_PIN 13 // GPIO13 D7 (Step 4)

const uint8_t numSteps = 4;
const uint8_t channelPins[4] = {CH1_PIN, CH2_PIN, CH3_PIN, CH4_PIN};

// ---------------- WIFI & MQTT ----------------
const char *ssid = "Coral_Wifi_Mesh";
const char *password = "Coral@Wifi";
const char *mqtt_broker = "35.154.62.193";
const int mqtt_port = 1883;

const char *command_topic = "smart_home/staircase/node1/command";
const char *status_topic = "smart_home/staircase/node1/status";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ---------------- SETTINGS ----------------
#define EEPROM_MAGIC 0xC4
struct Settings {
  uint8_t magic;
  uint8_t maxBrightness;
  float fadeStep;
  uint16_t stepDelay;
  uint16_t autoOffTimeout;
} settings;

// ---------------- STATE MACHINE ----------------
enum StairState {
  STATE_IDLE = 0,
  STATE_TURN_ON_UP = 1,
  STATE_TURN_ON_DOWN = 2,
  STATE_ON = 3,
  STATE_TURN_OFF_UP = 4,
  STATE_TURN_OFF_DOWN = 5
};

StairState currentState = STATE_IDLE;
unsigned long lastMotionTime = 0;
int currentAnimatingStep = -1;
unsigned long lastStepAnimTime = 0;
bool lastDirectionUp = true;

// ---------------- FADING ENGINE ----------------
float currentBrightness[4] = {0.0, 0.0, 0.0, 0.0};
uint8_t targetBrightness[4] = {0, 0, 0, 0};
const unsigned long FADE_INTERVAL = 5;
unsigned long lastFadeTime = 0;

const bool PWM_INVERTED = true;
const uint16_t PWM_RES = 255;
const uint16_t PWM_FREQ = 1000;

void writePwm(uint8_t pin, uint8_t duty) {
  if (PWM_INVERTED) {
    analogWrite(pin, PWM_RES - duty);
  } else {
    analogWrite(pin, duty);
  }
}

void fadeEngine() {
  unsigned long now = millis();
  if (now - lastFadeTime >= FADE_INTERVAL) {
    lastFadeTime = now;
    for (int i = 0; i < numSteps; i++) {
      if (currentBrightness[i] < targetBrightness[i]) {
        currentBrightness[i] += settings.fadeStep;
        if (currentBrightness[i] > targetBrightness[i])
          currentBrightness[i] = targetBrightness[i];
        writePwm(channelPins[i], (uint8_t)currentBrightness[i]);
      } else if (currentBrightness[i] > targetBrightness[i]) {
        currentBrightness[i] -= settings.fadeStep;
        if (currentBrightness[i] < targetBrightness[i])
          currentBrightness[i] = targetBrightness[i];
        writePwm(channelPins[i], (uint8_t)currentBrightness[i]);
      }
    }
  }
}

// ---------------- MQTT ENGINE ----------------
void publishStatus() {
  if (!mqttClient.connected())
    return;
  StaticJsonDocument<512> doc;

  doc["state"] = (int)currentState;
  doc["direction"] = lastDirectionUp ? "UP" : "DOWN";

  JsonObject setObj = doc.createNestedObject("settings");
  setObj["maxBrightness"] = settings.maxBrightness;
  setObj["fadeStep"] = settings.fadeStep;
  setObj["stepDelay"] = settings.stepDelay;
  setObj["autoOffTimeout"] = settings.autoOffTimeout;

  JsonArray br = doc.createNestedArray("brightness");
  for (int i = 0; i < numSteps; i++)
    br.add((int)currentBrightness[i]);

  char payload[512];
  serializeJson(doc, payload);
  mqttClient.publish(status_topic, payload, true);
}

void triggerUp() {
  lastDirectionUp = true;
  lastMotionTime = millis();
  if (currentState == STATE_IDLE || currentState == STATE_TURN_OFF_UP ||
      currentState == STATE_TURN_OFF_DOWN) {
    currentState = STATE_TURN_ON_UP;
    currentAnimatingStep = 0;
    lastStepAnimTime =
        millis() - settings.stepDelay; // Force trigger step 1 instantly
  }
}

void triggerDown() {
  lastDirectionUp = false;
  lastMotionTime = millis();
  if (currentState == STATE_IDLE || currentState == STATE_TURN_OFF_UP ||
      currentState == STATE_TURN_OFF_DOWN) {
    currentState = STATE_TURN_ON_DOWN;
    currentAnimatingStep = numSteps - 1;
    lastStepAnimTime =
        millis() - settings.stepDelay; // Force trigger top step instantly
  }
}

void triggerOff() {
  if (currentState == STATE_ON) {
    lastMotionTime = 0; // Force immediate timeout
  }
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  char msg[length + 1];
  memcpy(msg, payload, length);
  msg[length] = '\0';

  StaticJsonDocument<512> doc;
  DeserializationError err = deserializeJson(doc, msg);
  if (err)
    return;

  if (doc.containsKey("trigger")) {
    const char *trig = doc["trigger"];
    if (strcmp(trig, "UP") == 0)
      triggerUp();
    else if (strcmp(trig, "DOWN") == 0)
      triggerDown();
    else if (strcmp(trig, "OFF") == 0)
      triggerOff();
  }

  if (doc.containsKey("settings")) {
    JsonObject setObj = doc["settings"];
    if (setObj.containsKey("maxBrightness"))
      settings.maxBrightness = setObj["maxBrightness"];
    if (setObj.containsKey("fadeStep"))
      settings.fadeStep = setObj["fadeStep"];
    if (setObj.containsKey("stepDelay"))
      settings.stepDelay = setObj["stepDelay"];
    if (setObj.containsKey("autoOffTimeout"))
      settings.autoOffTimeout = setObj["autoOffTimeout"];

    EEPROM.put(0, settings);
    EEPROM.commit();
    publishStatus();
  }
}

void connectMqtt() {
  if (!mqttClient.connected()) {
    if (mqttClient.connect("staircase_main_client")) {
      mqttClient.subscribe(command_topic);
      publishStatus();
    }
  }
}

// ---------------- ANIMATION ENGINE ----------------
void animationEngine() {
  unsigned long now = millis();
  bool allDone = true;

  switch (currentState) {
  case STATE_IDLE:
    // Awaiting web triggers
    break;

  case STATE_TURN_ON_UP:
    if (currentAnimatingStep < numSteps) {
      if (now - lastStepAnimTime >= settings.stepDelay) {
        targetBrightness[currentAnimatingStep] = settings.maxBrightness;
        lastStepAnimTime = now;
        currentAnimatingStep++;
      }
    } else {
      allDone = true;
      for (int i = 0; i < numSteps; i++) {
        if (currentBrightness[i] < settings.maxBrightness)
          allDone = false;
      }
      if (allDone) {
        currentState = STATE_ON;
        lastMotionTime = now;
      }
    }
    break;

  case STATE_TURN_ON_DOWN:
    if (currentAnimatingStep >= 0) {
      if (now - lastStepAnimTime >= settings.stepDelay) {
        targetBrightness[currentAnimatingStep] = settings.maxBrightness;
        lastStepAnimTime = now;
        currentAnimatingStep--;
      }
    } else {
      allDone = true;
      for (int i = 0; i < numSteps; i++) {
        if (currentBrightness[i] < settings.maxBrightness)
          allDone = false;
      }
      if (allDone) {
        currentState = STATE_ON;
        lastMotionTime = now;
      }
    }
    break;

  case STATE_ON:
    if (now - lastMotionTime >= (settings.autoOffTimeout * 1000UL)) {
      // Timeout reached. Turn off sequentially based on direction.
      if (lastDirectionUp) {
        currentState = STATE_TURN_OFF_UP;
        currentAnimatingStep = 0;
      } else {
        currentState = STATE_TURN_OFF_DOWN;
        currentAnimatingStep = numSteps - 1;
      }
      lastStepAnimTime =
          now - settings.stepDelay; // Force trigger step 1 instantly
    }
    break;

  case STATE_TURN_OFF_UP:
    if (currentAnimatingStep < numSteps) {
      if (now - lastStepAnimTime >= settings.stepDelay) {
        targetBrightness[currentAnimatingStep] = 0;
        lastStepAnimTime = now;
        currentAnimatingStep++;
      }
    } else {
      allDone = true;
      for (int i = 0; i < numSteps; i++) {
        if (currentBrightness[i] > 0)
          allDone = false;
      }
      if (allDone)
        currentState = STATE_IDLE;
    }
    break;

  case STATE_TURN_OFF_DOWN:
    if (currentAnimatingStep >= 0) {
      if (now - lastStepAnimTime >= settings.stepDelay) {
        targetBrightness[currentAnimatingStep] = 0;
        lastStepAnimTime = now;
        currentAnimatingStep--;
      }
    } else {
      allDone = true;
      for (int i = 0; i < numSteps; i++) {
        if (currentBrightness[i] > 0)
          allDone = false;
      }
      if (allDone)
        currentState = STATE_IDLE;
    }
    break;
  }
}

// ---------------- SETUP & LOOP ----------------
void setup() {
  Serial.begin(115200);

  EEPROM.begin(128);
  EEPROM.get(0, settings);
  if (settings.magic != EEPROM_MAGIC) {
    settings.magic = EEPROM_MAGIC;
    settings.maxBrightness = 255;
    settings.fadeStep = 1.5;
    settings.stepDelay = 200;
    settings.autoOffTimeout = 20;
    EEPROM.put(0, settings);
    EEPROM.commit();
  }

  analogWriteRange(PWM_RES);
  analogWriteFreq(PWM_FREQ);

  for (int i = 0; i < numSteps; i++) {
    pinMode(channelPins[i], OUTPUT);
    writePwm(channelPins[i], 0);
  }

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  ArduinoOTA.setHostname("staircase_main");
  ArduinoOTA.setPassword("stair1234");
  ArduinoOTA.begin();

  mqttClient.setServer(mqtt_broker, mqtt_port);
  mqttClient.setCallback(mqttCallback);
}

void loop() {
  ArduinoOTA.handle();

  if (WiFi.status() == WL_CONNECTED) {
    connectMqtt();
    mqttClient.loop();
  }

  animationEngine();
  fadeEngine();

  // Throttle Status Publishes
  static unsigned long lastStatusPub = 0;
  if (millis() - lastStatusPub >= 1000) {
    lastStatusPub = millis();
    publishStatus();
  }

  delay(1);
}