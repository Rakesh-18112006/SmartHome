import mqtt from 'mqtt';
import { setMqttClient } from '../services/mqttManager.js';
import { updateSensorData, evaluateAutomations, getSensorData } from '../services/automationEngine.js';
import Device from '../models/Device.js';
import Sensor from '../models/Sensor.js';
import { updateDeviceCache } from '../services/cacheService.js';

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://35.154.62.193:1883';

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

    mqttClient.subscribe([
      'smarthome/+/+/status', 
      'smarthome/+/+/log', 
      'smart-switch/data',
      'smart-switch/+/data',
      'smart-switch/+/ping/status',
      'three-phase/+/ping/status',
      'energy-meter/three-phase',
      'energy-meter/single-phase',
      'touch-panel/+/switch/status',
      'touch-panel/+/ping/status',
      'smart_home/rgbw/+/status',
      'smart_home/rgbw/+/debug',
      'smart_home/rgbw/+/sensor/+'
    ]);
  });

  mqttClient.on('message', async (topic, message) => {
    const payload = message.toString();
    const topicParts = topic.split('/');
    
    let deviceId = null;
    let data = null;

    try {
      data = JSON.parse(payload);
    } catch (e) {
      return;
    }

    // Identify deviceId based on topic patterns
    if (topicParts[0] === 'smarthome' && topicParts[3] === 'status') {
      deviceId = topicParts[2];
    } else if ((topicParts[0] === 'three-phase' || topicParts[0] === 'smart-switch') && topicParts[2] === 'ping') {
      deviceId = topicParts[1];
    } else if (topic === 'smart-switch/data' || topicParts[0] === 'smart-switch') {
      deviceId = topicParts[1] !== 'data' ? topicParts[1] : (data.entityId || data.deviceId);
    } else if (topic === 'energy-meter/three-phase' || topic === 'energy-meter/single-phase') {
      deviceId = data.DeviceID;
    } else if (topicParts[0] === 'touch-panel') {
      deviceId = topicParts[1];
    } else if (topicParts[0] === 'smart_home' && topicParts[1] === 'rgbw') {
      deviceId = topicParts[2];
    }

    if (deviceId && data) {
      deviceId = String(deviceId).trim();
      try {
        const updates = { lastSeen: new Date() };
        if (data.lux !== undefined) updates.lastLux = data.lux;
        if (data.brightness !== undefined) updates.brightness = data.brightness;
        
        // Electrical parameters
        if (data.voltage !== undefined) updates.voltage = Number(data.voltage);
        if (data.current !== undefined) updates.current = Number(data.current);
        if (data.power !== undefined) updates.power = Number(data.power);
        if (data.energy !== undefined) updates.energy = Number(data.energy);
        if (data.PF !== undefined) updates.pf = Number(data.PF);
        if (data.temperature !== undefined) updates.temperature = Number(data.temperature);
        if (data.external_temp !== undefined) updates.externalTemp = Number(data.external_temp);

        // Map relay/state
        if (data.relayStatus !== undefined) updates.on = data.relayStatus === 'ON';
        if (data.switch !== undefined && Array.isArray(data.switch)) updates.on = data.switch[0] === 1;
        if (data.state !== undefined) updates.on = data.state === 'ON';
        
        if (data.effect !== undefined) updates.effect = data.effect;
        if (data.color !== undefined) {
          const [r, g, b] = data.color;
          updates.spectrumRgb = (r << 16) | (g << 8) | b;
        }

        // Atomic update and broadcast
        const updatedDevice = await Device.findOneAndUpdate({ deviceId }, updates, { returnDocument: 'after', lean: true });
        if (updatedDevice) {
          updateDeviceCache(deviceId, updatedDevice);
          io.emit('device_state_update', updatedDevice);
        }

        // Handle sensor data for automation engine
        const sensorUpdates = {};
        if (data.lux !== undefined) sensorUpdates.lux = data.lux;
        if (data.temperature !== undefined) sensorUpdates.temperature = data.temperature;
        if (data.humidity !== undefined) sensorUpdates.humidity = data.humidity;
        if (data.motion !== undefined) sensorUpdates.motion = data.motion;

        if (Object.keys(sensorUpdates).length > 0) {
          updateSensorData(sensorUpdates);
          io.emit('sensor_data_update', getSensorData());
          evaluateAutomations(io).catch(err => console.error('[AUTOMATION] Eval error:', err));
        }
      } catch (e) {
        console.error(`Error processing MQTT status for ${deviceId}`, e);
      }
    }

    // Handle custom sensors (ATOMIC UPDATE to avoid ParallelSaveError)
    try {
      const sensorVal = (typeof data === 'object' && data.value !== undefined) ? data.value : data;
      const updatedSensor = await Sensor.findOneAndUpdate(
        { topic },
        { value: data, lastUpdated: new Date() },
        { returnDocument: 'after', lean: true }
      );

      if (updatedSensor) {
        updateSensorData({ [updatedSensor.name]: sensorVal });
        io.emit('custom_sensor_update', updatedSensor);
        io.emit('sensor_data_update', getSensorData());
        evaluateAutomations(io).catch(err => console.error('[AUTOMATION] Custom Eval error:', err));
      }
    } catch (err) {
      console.error(`Error processing custom sensor for ${topic}`, err);
    }

    io.emit('mqtt_message', { topic, message: payload });
  });

  mqttClient.on('error', (err) => {
    console.error('MQTT error:', err);
    io.emit('mqtt_status', { status: 'Error' });
  });

  return mqttClient;
};
