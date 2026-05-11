import mqtt from 'mqtt';
import { setMqttClient } from '../services/mqttManager.js';
import { getState, updateState } from '../services/deviceState.js';
import { updateSensorData, evaluateAutomations, getSensorData } from '../services/automationEngine.js';

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://35.154.62.193:1883';
const MQTT_STATUS_TOPIC = 'rgbw-light/1234/light/status';
const MQTT_LOG_TOPIC = 'rgbw-light/1234/debug/log';

export const connectMQTT = (io) => {
  const mqttClient = mqtt.connect(MQTT_BROKER, {
    keepalive: 60,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000
  });

  mqttClient.on('connect', () => {
    console.log('📡 Connected to MQTT broker at:', MQTT_BROKER);
    setMqttClient(mqttClient);
    io.emit('mqtt_status', { status: 'Connected' });

    mqttClient.subscribe([MQTT_STATUS_TOPIC, MQTT_LOG_TOPIC]);
  });

  mqttClient.on('message', async (topic, message) => {
    const payload = message.toString();
    
    // Pass lux and device state back to the frontend
    if (topic === MQTT_STATUS_TOPIC) {
      try {
        const data = JSON.parse(payload);
        
        // Sync the global state with the physical device's report
        const updates = {};
        if (data.lux !== undefined) updates.lastLux = data.lux;
        if (data.brightness !== undefined) updates.brightness = data.brightness;
        if (data.state !== undefined) updates.state = data.state;
        if (data.effect !== undefined) updates.effect = data.effect;
        if (data.color !== undefined) updates.color = data.color;
        
        const state = updateState(updates);
        io.emit('device_state_update', state);

        // ─── Automation Engine: Update sensor data & evaluate rules ───
        const sensorUpdates = {};
        if (data.lux !== undefined) sensorUpdates.lux = data.lux;
        if (data.temperature !== undefined) sensorUpdates.temperature = data.temperature;
        if (data.humidity !== undefined) sensorUpdates.humidity = data.humidity;
        if (data.motion !== undefined) sensorUpdates.motion = data.motion;

        if (Object.keys(sensorUpdates).length > 0) {
          updateSensorData(sensorUpdates);
          io.emit('sensor_data_update', getSensorData());
          // Evaluate all automation rules against updated sensor data
          await evaluateAutomations(io);
        }
        // ──────────────────────────────────────────────────────────────
        
      } catch (e) {
        console.error('Error processing MQTT status', e);
      }
    }

    io.emit('mqtt_message', { topic, message: payload });
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err);
    io.emit('mqtt_status', { status: 'Error' });
  });

  return mqttClient;
};
