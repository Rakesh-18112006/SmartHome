import { publishToTopic } from './mqttManager.js';
import Device from '../models/Device.js';
import { getSensorData, updateSensorData, evaluateAutomations } from './automationEngine.js';

import { getDevice, updateDeviceCache } from './cacheService.js';

const pendingDeviceWrites = new Map();
const WRITE_FLUSH_DELAY_MS = 150;

const toPlainDevice = (device) => (
  typeof device?.toObject === 'function' ? device.toObject() : device
);

const mergeDeviceState = (device, updates) => {
  const base = toPlainDevice(device);
  return base ? { ...base, ...updates } : null;
};

const queueDeviceWrite = (deviceId, updates, io) => {
  const pending = pendingDeviceWrites.get(deviceId) || { updates: {}, timer: null };
  pending.updates = { ...pending.updates, ...updates };

  if (pending.timer) clearTimeout(pending.timer);

  pending.timer = setTimeout(async () => {
    const current = pendingDeviceWrites.get(deviceId);
    if (!current) return;
    pendingDeviceWrites.delete(deviceId);

    try {
      const updatedDevice = await Device.findOneAndUpdate(
        { deviceId },
        current.updates,
        { returnDocument: 'after', lean: true }
      );

      if (updatedDevice) {
        updateDeviceCache(deviceId, updatedDevice);
        if (io) io.emit('device_state_update', updatedDevice);
      }
    } catch (err) {
      console.error(`[SOCKET] DB update error for ${deviceId}:`, err.message);
    }
  }, WRITE_FLUSH_DELAY_MS);

  pendingDeviceWrites.set(deviceId, pending);
};

/**
 * Optimized helper to handle device state updates and MQTT command publishing.
 * Uses a global cache and non-blocking MQTT publishing for maximum responsiveness.
 */
const updateDeviceAndPublish = async (deviceId, updates, mqttPayload, topicOverride, io) => {
  // 1. Get Device from Global Cache or DB
  const device = await getDevice(deviceId);

  if (!device) {
    console.warn(`[SOCKET] updateDeviceAndPublish FAILED: Device ${deviceId} not found in database.`);
    return null;
  }

  // 2. Determine Topic (Prioritize RGBW standard)
  let finalTopic = topicOverride || device.topic;
  if (!finalTopic) {
    if (deviceId.startsWith('B3E') || deviceId.startsWith('B1E')) {
      finalTopic = `energy-meter/three-phase/command/${deviceId}`;
    } else if (deviceId.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
      finalTopic = `smart-switch/command/${deviceId}`;
    } else if (device.type === 'rgbw' || device.type === 'light' || deviceId.startsWith('rgbw')) {
      finalTopic = `smart_home/rgbw/${deviceId}/command`;
    } else {
      finalTopic = `smarthome/${device.type}/${deviceId}`;
    }
  }

  // Set Manual Override to prevent automations from fighting the user
  const overrideDate = new Date(Date.now() + 30 * 60 * 1000); // 30 mins
  const finalUpdates = { ...updates, manualOverrideUntil: overrideDate };

  // Update the UI/cache immediately so controls feel instant while MongoDB is
  // updated shortly after. Rapid slider/color changes collapse to one write.
  const optimisticDevice = mergeDeviceState(device, finalUpdates);
  if (optimisticDevice) {
    updateDeviceCache(deviceId, optimisticDevice);
    if (io) io.emit('device_state_update', optimisticDevice);
  }

  // 3. Fire MQTT Command IMMEDIATELY (Non-blocking)
  publishToTopic(finalTopic, mqttPayload).catch(err => 
    console.error(`[SOCKET] Publish FAILED for ${deviceId}:`, err.message)
  );

  // 4. Persist in the background without blocking command responsiveness.
  queueDeviceWrite(deviceId, finalUpdates, io);
  return optimisticDevice;
};

export const initSocket = (io, mqttClient) => {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current MQTT status immediately
    socket.emit('mqtt_status', { 
      status: mqttClient.connected ? 'Connected' : 'Offline' 
    });

    socket.on('power_toggle', async (data) => {
      const { deviceId, state, relayStatus, entityId } = data;
      const on = state ? (state === 'ON') : (relayStatus === 'ON');
      const id = deviceId || entityId;
      const device = await getDevice(id);
      if (!device) return;
      
      const mqttPayload = (id.startsWith('B3E') || id.startsWith('B1E') || id.startsWith('BSP') || device.type === 'plug' || device.type === 'switch')
        ? { entityId: id, relayStatus: on ? 'ON' : 'OFF' }
        : { state: on ? 'ON' : 'OFF' };
      
      await updateDeviceAndPublish(id, { on }, mqttPayload, null, io);
    });

    socket.on('touch_panel_all_off', async (data) => {
      const { deviceId } = data;
      let device = await getDevice(deviceId);
      if (!device || !device.subDevices) return;

      const topic = `touch-panel/${deviceId}/switch/command`;
      
      for (const sd of device.subDevices) {
        if (!sd.on) continue;
        publishToTopic(topic, { entityId: deviceId, type: 'switch', value: `${sd.index}0` }).catch(err =>
          console.error(`[SOCKET] All-off publish failed for ${deviceId}:`, err.message)
        );
      }

      const updatedDevice = await Device.findOneAndUpdate(
        { deviceId },
        { $set: { "subDevices.$[].on": false, "subDevices.$[].speed": 0 } },
        { returnDocument: 'after', lean: true }
      );

      if (updatedDevice) {
        updateDeviceCache(deviceId, updatedDevice);
        io.emit('device_state_update', updatedDevice);
      }
    });

    socket.on('touch_panel_action', async (data) => {
      const { deviceId, subDeviceIndex, type, value } = data;
      const device = await getDevice(deviceId);
      if (!device) return;

      let topic = `touch-panel/${deviceId}/switch/command`;
      let mqttPayload = { entityId: deviceId };
      let update = null;

      if (deviceId.startsWith('BSQ')) {
        // BSQ Protocol: { index: N, status: 0/1 }
        if (type === 'switch') {
          mqttPayload.index = subDeviceIndex;
          mqttPayload.status = value ? 1 : 0;
          update = { $set: { "subDevices.$.on": value } };
        } else if (type === 'fan_speed' || type === 'fan') {
          topic = `touch-panel/${deviceId}/dimmer/command`;
          mqttPayload.index = 0; // Typically 1 dimmer per panel
          mqttPayload.status = value;
          update = { $set: { "subDevices.$.speed": value, "subDevices.$.on": value > 0 } };
        }
      } else {
        // Standard BS/Curtain Protocol: { type: 'switch', value: '11' }
        if (type === 'switch') {
          mqttPayload.type = 'switch';
          mqttPayload.value = `${subDeviceIndex}${value ? '1' : '0'}`;
          update = { $set: { "subDevices.$.on": value } };
        } else if (type === 'fan_speed' || type === 'fan') {
          mqttPayload.type = 'dimmer';
          mqttPayload.dimmer = String(subDeviceIndex);
          mqttPayload.value = String(value);
          update = { $set: { "subDevices.$.speed": value, "subDevices.$.on": value > 0 } };
        }
      }

      if (!update) return;

      // Set Manual Override to prevent automations from fighting the user
      const overrideDate = new Date(Date.now() + 30 * 60 * 1000); // 30 mins

      publishToTopic(topic, mqttPayload).catch(err =>
        console.error(`[SOCKET] Touch-panel publish failed for ${deviceId}:`, err.message)
      );

      const updatedDevice = await Device.findOneAndUpdate(
        { deviceId, "subDevices.index": subDeviceIndex },
        { 
          ...update, 
          $set: { ...update.$set, manualOverrideUntil: overrideDate } 
        },
        { returnDocument: 'after', lean: true }
      );

      if (updatedDevice) {
        updateDeviceCache(deviceId, updatedDevice);
        io.emit('device_state_update', updatedDevice);
      }
    });

    socket.on('set_offline_timer', async (data) => {
      const { deviceId, timer, action } = data;
      const device = await getDevice(deviceId);
      if (!device) return;

      let prefix = deviceId.startsWith('B3E') || deviceId.startsWith('B1E') ? 'three-phase' : 'smart-switch';
      const topic = `${prefix}/${device.deviceId}/timer/command`;
      publishToTopic(topic, { timer: String(timer), action: String(action) });
    });

    socket.on('add_schedule', async (data) => {
      const { deviceId, startTime, endTime, days, startAction, endAction } = data;
      const device = await Device.findOneAndUpdate(
        { deviceId },
        { $push: { schedules: { startTime, endTime, days, startAction, endAction, enabled: true } } },
        { returnDocument: 'after', lean: true }
      );
      if (device) {
        updateDeviceCache(deviceId, device);
        io.emit('device_state_update', device);
      }
    });

    socket.on('remove_schedule', async (data) => {
      const { deviceId, scheduleId } = data;
      const device = await Device.findOneAndUpdate(
        { deviceId },
        { $pull: { schedules: { _id: scheduleId } } },
        { returnDocument: 'after', lean: true }
      );
      if (device) {
        updateDeviceCache(deviceId, device);
        io.emit('device_state_update', device);
      }
    });

    socket.on('color_change', async (data) => {
      const { deviceId, r, g, b, w } = data;
      const rgb = (r << 16) | (g << 8) | b;
      
      const mqttPayload = {
        state: 'ON',
        effect: 'solid',
        color: [r, g, b, w]
      };

      await updateDeviceAndPublish(deviceId, { 
        spectrumRgb: rgb, 
        on: true, 
        effect: 'solid' 
      }, mqttPayload, null, io);
    });

    socket.on('brightness_change', async (data) => {
      const { deviceId, brightness } = data;
      
      const mqttPayload = {
        state: 'ON',
        effect: 'solid',
        brightness: brightness 
      };

      await updateDeviceAndPublish(deviceId, { brightness, on: true, effect: 'solid' }, mqttPayload, null, io);
    });

    socket.on('white_change', async (data) => {
      const { deviceId, white } = data;
      const device = await getDevice(deviceId);
      if (!device) return;

      const r = (device.spectrumRgb >> 16) & 0xFF;
      const g = (device.spectrumRgb >> 8) & 0xFF;
      const b = device.spectrumRgb & 0xFF;

      const mqttPayload = {
        state: 'ON',
        effect: 'solid',
        color: [r, g, b, white]
      };

      await updateDeviceAndPublish(deviceId, { on: true, effect: 'solid' }, mqttPayload, null, io);
    });

    socket.on('toggle_auto_mode', async (data) => {
      const { deviceId, enabled } = data;
      
      const mqttPayload = {
        state: 'ON',
        effect: enabled ? 'auto' : 'solid'
      };
      
      await updateDeviceAndPublish(deviceId, { effect: mqttPayload.effect, on: true }, mqttPayload, null, io);
    });

    socket.on('curtain_action', async (data) => {
      const { deviceId, action } = data; // action is 10, 11, 20, 21
      
      const topic = `touch-panel/${deviceId}/switch/command`;
      const mqttPayload = { 
        type: 'switch',
        value: String(action)
      };
      
      publishToTopic(topic, mqttPayload);
    });

    socket.on('force_white_mode', async (data) => {
      const { deviceId } = data;
      
      const mqttPayload = {
        state: 'ON',
        effect: 'auto_white'
      };
      
      await updateDeviceAndPublish(deviceId, { effect: 'auto_white', on: true }, mqttPayload, null, io);
    });

    // ─── Automation / Sensor Events ───
    socket.on('get_sensor_data', () => {
      socket.emit('sensor_data_update', getSensorData());
    });

    socket.on('simulate_sensor', async (data) => {
      updateSensorData(data);
      io.emit('sensor_data_update', getSensorData());
      await evaluateAutomations(io);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};
