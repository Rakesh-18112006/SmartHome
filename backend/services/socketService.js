import { publishToTopic } from './mqttManager.js';
import Device from '../models/Device.js';
import { getSensorData, updateSensorData, evaluateAutomations } from './automationEngine.js';

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
      
      // Look up device to get its type and topic
      const device = await Device.findOne({ deviceId: id });
      if (!device) return;

      let topic = device.topic || `smarthome/${device.type}/${device.deviceId}`;
      
      if (device.type === 'rgbw' || device.type === 'light') {
        topic = `smart_home/rgbw/${id}/command`;
      } else if (id.startsWith('B3E') || id.startsWith('B1E')) {
        topic = `energy-meter/three-phase/command/${id}`;
      } else if (id.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
        topic = `smart-switch/command/${id}`;
      }

      const mqttPayload = (id.startsWith('B3E') || id.startsWith('B1E') || id.startsWith('BSP') || device.type === 'plug' || device.type === 'switch')
        ? { entityId: id, relayStatus: on ? 'ON' : 'OFF' }
        : { state: on ? 'ON' : 'OFF' };
      
      await updateDeviceAndPublish(device.deviceId, { on }, mqttPayload, topic);
    });

    socket.on('touch_panel_all_off', async (data) => {
      const { deviceId } = data;
      const device = await Device.findOne({ deviceId });
      if (!device || !device.subDevices) return;

      const topic = `touch-panel/${deviceId}/switch/command`;
      
      for (const sd of device.subDevices) {
        if (!sd.on) continue;

        let mqttPayload = { 
          entityId: deviceId,
          type: 'switch',
          value: `${sd.index}0` // Index + '0' for OFF
        };
        
        await publishToTopic(topic, mqttPayload);
        
        // Add a small delay to prevent network congestion/dropped messages
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      // Update all to OFF in DB
      await Device.updateOne(
        { deviceId },
        { $set: { "subDevices.$[].on": false, "subDevices.$[].speed": 0 } }
      );

      const updatedDevice = await Device.findOne({ deviceId });
      io.emit('device_updated', updatedDevice);
    });

    socket.on('touch_panel_action', async (data) => {
      const { deviceId, subDeviceIndex, type, value } = data;
      const device = await Device.findOne({ deviceId });
      if (!device) return;

      const topic = `touch-panel/${deviceId}/switch/command`;
      let mqttPayload = { entityId: deviceId };

      if (type === 'switch') {
        const state = value ? '1' : '0';
        mqttPayload.type = 'switch';
        mqttPayload.value = `${subDeviceIndex}${state}`;
        
        // Optimistic update
        await Device.updateOne(
          { deviceId, "subDevices.index": subDeviceIndex },
          { $set: { "subDevices.$.on": value } }
        );
      } else if (type === 'fan') {
        mqttPayload.type = 'dimmer';
        mqttPayload.dimmer = String(subDeviceIndex);
        mqttPayload.value = String(value);

        // Optimistic update
        await Device.updateOne(
          { deviceId, "subDevices.index": subDeviceIndex },
          { $set: { "subDevices.$.speed": value, "subDevices.$.on": value > 0 } }
        );
      }

      await publishToTopic(topic, mqttPayload);
      
      // Update local devices and emit
      const updatedDevice = await Device.findOne({ deviceId });
      io.emit('device_updated', updatedDevice);
    });

    socket.on('set_offline_timer', async (data) => {
      const { deviceId, timer, action } = data;
      const device = await Device.findOne({ deviceId });
      if (!device) return;

      // Determine topic prefix based on device ID prefix
      let prefix = 'smart-switch';
      if (deviceId.startsWith('B3E') || deviceId.startsWith('B1E')) {
        prefix = 'three-phase';
      } else if (deviceId.startsWith('BSP')) {
        prefix = 'smart-switch';
      }

      const topic = `${prefix}/${device.deviceId}/timer/command`;
      const mqttPayload = {
        timer: String(timer),
        action: String(action)
      };

      await publishToTopic(topic, mqttPayload);
      console.log(`[TIMER] Set offline timer for ${deviceId} on topic ${topic}: ${timer} mins, action ${action}`);
    });

    socket.on('add_schedule', async (data) => {
      const { deviceId, startTime, endTime, days, startAction, endAction } = data;
      const device = await Device.findOneAndUpdate(
        { deviceId },
        { $push: { schedules: { startTime, endTime, days, startAction, endAction, enabled: true } } },
        { returnDocument: 'after' }
      );
      if (device) {
        io.emit('device_state_update', device);
        console.log(`[SCHEDULE] Added custom action schedule for ${deviceId}`);
      }
    });

    socket.on('remove_schedule', async (data) => {
      const { deviceId, scheduleId } = data;
      const device = await Device.findOneAndUpdate(
        { deviceId },
        { $pull: { schedules: { _id: scheduleId } } },
        { returnDocument: 'after' }
      );
      if (device) {
        io.emit('device_state_update', device);
        console.log(`[SCHEDULE] Removed schedule for ${deviceId}`);
      }
    });

    // Modified helper to accept optional topic override
    const updateDeviceAndPublish = async (deviceId, updates, mqttPayload, topicOverride) => {
      // Find the device first to get the correct topic if not provided
      const device = await Device.findOne({ deviceId });
      if (!device) return null;

      const topic = topicOverride || device.topic || `smarthome/${device.type}/${device.deviceId}`;
      let finalTopic = topic;
      if (!topicOverride && !device.topic && (device.type === 'rgbw' || device.type === 'light')) {
        finalTopic = `smart_home/rgbw/${device.deviceId}/command`;
      }

      // Execute publish and DB update in parallel for maximum speed
      const [updatedDevice] = await Promise.all([
        Device.findOneAndUpdate({ deviceId }, updates, { new: true }),
        publishToTopic(finalTopic, mqttPayload)
      ]);

      if (updatedDevice) {
        io.emit('device_state_update', updatedDevice);
        return updatedDevice;
      }
      return null;
    };

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
      }, mqttPayload);
    });

    socket.on('brightness_change', async (data) => {
      const { deviceId, brightness } = data;
      
      const mqttPayload = {
        state: 'ON',
        brightness: Math.round((brightness / 100) * 255) // Map 0-100 to 0-255 if needed, or use raw
      };
      
      // If the UI sends 0-255, we use that. The App.jsx seems to send raw 0-255 for lights.
      // But for curtains it sends 0-100.
      mqttPayload.brightness = brightness; 

      await updateDeviceAndPublish(deviceId, { brightness, on: true }, mqttPayload);
    });

    socket.on('white_change', async (data) => {
      const { deviceId, white } = data;
      const device = await Device.findOne({ deviceId });
      if (!device) return;

      const r = (device.spectrumRgb >> 16) & 0xFF;
      const g = (device.spectrumRgb >> 8) & 0xFF;
      const b = device.spectrumRgb & 0xFF;

      const mqttPayload = {
        state: 'ON',
        effect: 'solid',
        color: [r, g, b, white]
      };

      await updateDeviceAndPublish(deviceId, { on: true }, mqttPayload);
    });

    socket.on('toggle_auto_mode', async (data) => {
      const { deviceId, enabled } = data;
      
      const mqttPayload = {
        state: 'ON',
        effect: enabled ? 'auto' : 'solid'
      };
      
      await updateDeviceAndPublish(deviceId, { effect: mqttPayload.effect, on: true }, mqttPayload);
    });

    socket.on('curtain_action', async (data) => {
      const { deviceId, action } = data; // action is 10, 11, 20, 21
      
      const device = await Device.findOne({ deviceId });
      if (!device) return;

      const topic = `touch-panel/${deviceId}/switch/command`;
      const mqttPayload = { 
        type: 'switch',
        value: String(action)
      };
      
      await publishToTopic(topic, mqttPayload);
      console.log(`[CURTAIN] Sent action ${action} to ${deviceId} on topic ${topic}`);
    });

    socket.on('force_white_mode', async (data) => {
      const { deviceId } = data;
      
      const mqttPayload = {
        state: 'ON',
        effect: 'auto_white'
      };
      
      await updateDeviceAndPublish(deviceId, { effect: 'auto_white', on: true }, mqttPayload);
    });

    // ─── Automation / Sensor Events ───

    // Request current sensor data
    socket.on('get_sensor_data', () => {
      socket.emit('sensor_data_update', getSensorData());
    });

    // Simulate sensor data change (for testing without physical sensors)
    socket.on('simulate_sensor', async (data) => {
      console.log('[SENSOR SIM] Simulating sensor update:', data);
      updateSensorData(data);
      io.emit('sensor_data_update', getSensorData());
      // Evaluate automations with new sensor data
      await evaluateAutomations(io);
    });

    // ──────────────────────────────────

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });
};
