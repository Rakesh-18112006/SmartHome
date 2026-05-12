import mqtt from 'mqtt';
import { setMqttClient } from '../services/mqttManager.js';
import { getState, updateState } from '../services/deviceState.js';
import { updateSensorData, evaluateAutomations, getSensorData } from '../services/automationEngine.js';
import Device from '../models/Device.js';

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

    // Subscribe to all smarthome device topics including specific PDF topics
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
      MQTT_STATUS_TOPIC
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
      // For smart-switch, ID might be in the topic or payload
      deviceId = topicParts[1] !== 'data' ? topicParts[1] : (data.entityId || data.deviceId);
    } else if (topic === 'energy-meter/three-phase' || topic === 'energy-meter/single-phase') {
      deviceId = data.DeviceID;
    } else if (topicParts[0] === 'touch-panel') {
      deviceId = topicParts[1];
    }

    if (deviceId && data) {
      deviceId = String(deviceId).trim();
      try {
        const updates = { lastSeen: new Date() };
        if (data.lux !== undefined) updates.lastLux = data.lux;
        if (data.brightness !== undefined) updates.brightness = data.brightness;
        
        // Electrical parameters from smart-switch/data
        if (data.voltage !== undefined) updates.voltage = Number(data.voltage);
        if (data.current !== undefined) updates.current = Number(data.current);
        if (data.power !== undefined) updates.power = Number(data.power);
        if (data.energy !== undefined) updates.energy = Number(data.energy);
        if (data.PF !== undefined) updates.pf = Number(data.PF);
        if (data.temperature !== undefined) updates.temperature = Number(data.temperature);
        if (data.external_temp !== undefined) updates.externalTemp = Number(data.external_temp);

        // 3-Phase specific fields
        if (data.Voltage_R !== undefined) updates.voltageR = Number(data.Voltage_R);
        if (data.Voltage_Y !== undefined) updates.voltageY = Number(data.Voltage_Y);
        if (data.Voltage_B !== undefined) updates.voltageB = Number(data.Voltage_B);
        if (data.Current_R !== undefined) updates.currentR = Number(data.Current_R);
        if (data.Current_Y !== undefined) updates.currentY = Number(data.Current_Y);
        if (data.Current_B !== undefined) updates.currentB = Number(data.Current_B);
        if (data.Power_R !== undefined) updates.powerR = Number(data.Power_R);
        if (data.Power_Y !== undefined) updates.powerY = Number(data.Power_Y);
        if (data.Power_B !== undefined) updates.powerB = Number(data.Power_B);
        if (data.PF_R !== undefined) updates.pfR = Number(data.PF_R);
        if (data.PF_Y !== undefined) updates.pfY = Number(data.PF_Y);
        if (data.PF_B !== undefined) updates.pfB = Number(data.PF_B);
        if (data.Energy !== undefined) updates.energy = Number(data.Energy);
        if (data.Apparent_Energy !== undefined) updates.apparentEnergy = Number(data.Apparent_Energy);
        if (data.Reactive_Energy !== undefined) updates.reactiveEnergy = Number(data.Reactive_Energy);

        // Single-Phase specific fields (Bijli Auditor)
        if (data.Voltage !== undefined) updates.voltage = Number(data.Voltage);
        if (data.Current !== undefined) updates.current = Number(data.Current);
        if (data.PF !== undefined) updates.pf = Number(data.PF);
        if (data.Power !== undefined) updates.power = Number(data.Power);
        if (data.Apparent !== undefined) updates.apparentPowerR = Number(data.Apparent); // reuse R-phase field for single phase total
        if (data.Reactive !== undefined) updates.reactivePowerR = Number(data.Reactive);
        if (data.PhaseAngle !== undefined) updates.phaseAngle = Number(data.PhaseAngle);

        // Touch Panel Switch/Fan Status Parsing
        if (topic.includes('/switch/status') || topic.includes('/ping/status')) {
          if (data.switch || data.dimmer) {
            const device = await Device.findOne({ deviceId });
            if (!device || !device.subDevices) return;
            
            device.lastSeen = new Date();

            // 1. Sync Switch & Fan "ON" states
            if (data.switch && Array.isArray(data.switch)) {
              data.switch.forEach((status, i) => {
                const index = i + 1;
                const sd = device.subDevices.find(s => s.index === index);
                if (sd) sd.on = (status === 1);
              });
            }

            // 2. Sync Fan Speeds
            if (data.dimmer && Array.isArray(data.dimmer)) {
              const fans = device.subDevices.filter(sd => sd.type === 'fan');
              data.dimmer.forEach((speed, i) => {
                if (fans[i]) {
                  const sVal = Number(speed);
                  if (sVal > 0) fans[i].speed = sVal;
                }
              });
            }

            // Save all changes at once
            const updated = await device.save();
            
            // Emit the fully updated device to frontend
            io.emit('device_state_update', updated);
            return;
          }
        }

        // Map relay status: PDF uses "relayStatus":"ON" or "switch":[1]
        if (data.relayStatus !== undefined) updates.on = data.relayStatus === 'ON';
        if (data.switch !== undefined && Array.isArray(data.switch)) updates.on = data.switch[0] === 1;
        if (data.state !== undefined) updates.on = data.state === 'ON';
        
        if (data.effect !== undefined) updates.effect = data.effect;
        if (data.color !== undefined) {
          const [r, g, b] = data.color;
          updates.spectrumRgb = (r << 16) | (g << 8) | b;
        }

        // Timer parsing from PDF format: {"timer":{"remaining":30,"action":10}}
        if (data.timer) {
          updates.timerRemaining = data.timer.remaining;
          updates.timerAction = String(data.timer.action);
        }
        
        const updatedDevice = await Device.findOneAndUpdate({ deviceId }, updates, { returnDocument: 'after' });
        if (updatedDevice) {
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
          await evaluateAutomations(io);
        }
      } catch (e) {
        console.error(`Error processing MQTT status for ${deviceId}`, e);
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
