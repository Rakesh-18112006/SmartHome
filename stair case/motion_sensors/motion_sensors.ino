/*
============================================================
Staircase Lighting System - Motion Sensor Node
ESP8266 + 2 PIR Sensors (Bottom & Top)
Publishes JSON triggers to MQTT for the Staircase Controller
============================================================
*/

#include <ESP8266WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ---------------- PINS ----------------
#define PIR_BOTTOM_PIN 14  // GPIO14 / D5 (Bottom of stairs)
#define PIR_TOP_PIN    12  // GPIO12 / D6 (Top of stairs)

// ---------------- WIFI & MQTT CREDENTIALS ----------------
const char *ssid = "Coral_Wifi_Mesh";
const char *password = "Coral@Wifi";
const char *mqtt_broker = "35.154.62.193";
const int mqtt_port = 1883;

// ---------------- MQTT TOPICS ----------------
// We publish directly to the general staircase trigger topic
const char *command_topic = "smart_home/staircase/trigger";
// We can also publish to a general motion topic for system logs/web UI
const char *motion_log_topic = "smart_home/staircase/motion/status";

WiFiClient espClient;
PubSubClient mqttClient(espClient);

// ---------------- SETTINGS & TIMING ----------------
const unsigned long COOLDOWN_TIME = 15000; // 15 seconds cooldown to let animation finish before re-triggering
unsigned long lastTriggerTime = 0;

void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("");
  Serial.println("WiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
}

void reconnect() {
  // Loop until we're reconnected
  while (!mqttClient.connected()) {
    Serial.print("Attempting MQTT connection...");
    // Create a unique client ID
    String clientId = "Staircase_Motion_Sensor_";
    clientId += String(random(0xffff), HEX);
    
    if (mqttClient.connect(clientId.c_str())) {
      Serial.println("connected");
      // Optional: subscribe if we need to receive configurations
    } else {
      Serial.print("failed, rc=");
      Serial.print(mqttClient.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// Helper function to send the trigger payload
void publishTrigger(const char* direction) {
  StaticJsonDocument<128> doc;
  doc["trigger"] = direction;
  
  char payload[128];
  serializeJson(doc, payload);
  
  Serial.print("Publishing trigger to ");
  Serial.print(command_topic);
  Serial.print(": ");
  Serial.println(payload);
  
  // Publish with retain = false, QoS = 1
  mqttClient.publish(command_topic, payload, false);
  
  // Also log to the general motion topic
  StaticJsonDocument<128> logDoc;
  logDoc["sensor"] = direction; // "UP" indicates bottom sensor, "DOWN" indicates top sensor
  logDoc["motionDetected"] = true;
  logDoc["timestamp"] = millis();
  
  char logPayload[128];
  serializeJson(logDoc, logPayload);
  mqttClient.publish(motion_log_topic, logPayload, true);
}

void setup() {
  Serial.begin(115200);
  
  // Configure PIR pins with pull-down or normal input depending on hardware
  pinMode(PIR_BOTTOM_PIN, INPUT);
  pinMode(PIR_TOP_PIN, INPUT);
  
  setup_wifi();
  
  mqttClient.setServer(mqtt_broker, mqtt_port);
  
  Serial.println("Staircase Motion Sensor Node Initialized!");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    setup_wifi();
  }
  
  if (!mqttClient.connected()) {
    reconnect();
  }
  
  mqttClient.loop();

  unsigned long now = millis();
  
  // Check if we are outside the trigger cooldown period
  if (now - lastTriggerTime >= COOLDOWN_TIME || lastTriggerTime == 0) {
    int bottomState = digitalRead(PIR_BOTTOM_PIN);
    int topState = digitalRead(PIR_TOP_PIN);
    
    if (bottomState == HIGH) {
      Serial.println("\n[MOTION] Bottom sensor triggered! Walking UP.");
      publishTrigger("UP");
      lastTriggerTime = now;
    } 
    else if (topState == HIGH) {
      Serial.println("\n[MOTION] Top sensor triggered! Walking DOWN.");
      publishTrigger("DOWN");
      lastTriggerTime = now;
    }
  } else {
    // During cooldown, optionally flash status LED or print wait time
    static unsigned long lastCooldownPrint = 0;
    if (now - lastCooldownPrint >= 3000 && lastTriggerTime > 0) {
      unsigned long remaining = (COOLDOWN_TIME - (now - lastTriggerTime)) / 1000;
      Serial.print("[COOLDOWN] Waiting for animation to complete... ");
      Serial.print(remaining);
      Serial.println("s left.");
      lastCooldownPrint = now;
    }
  }

  delay(10); // Small stability delay
}
