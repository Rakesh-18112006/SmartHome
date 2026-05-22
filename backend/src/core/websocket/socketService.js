import { publishToTopic } from '../../integrations/mqtt/mqttManager.js';
import Device from '../../modules/devices/Device.js';
import Automation from '../../modules/automations/Automation.js';
import { getSensorData, updateSensorData, evaluateAutomations } from '../../modules/automations/automationEngine.js';
import { callService, sendMessage, cachedHaStates } from '../../integrations/homeassistant/ha-client.js';
import { publishStateToHA } from '../../integrations/homeassistant/ha-discovery.js';
import { initStaircase } from '../../modules/staircase/staircaseService.js';
import { setupMASocketEvents } from '../../integrations/musicassistant/mass-client.js';

export const initSocket = (io, mqttClient) => {
  initStaircase(io);

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    setupMASocketEvents(socket);

    // Send current MQTT status immediately
    socket.emit('mqtt_status', { 
      status: mqttClient.connected ? 'Connected' : 'Offline' 
    });

    // Send currently cached Home Assistant states to the new client
    cachedHaStates.forEach(state => {
      socket.emit('ha_entity_state_change', state);
    });

    socket.on('request_initial_states', () => {
      socket.emit('mqtt_status', { 
        status: mqttClient.connected ? 'Connected' : 'Offline' 
      });
      cachedHaStates.forEach(state => {
        socket.emit('ha_entity_state_change', state);
      });
    });

    socket.on('ha_command', (data) => {
      const { domain, service, entityId, serviceData } = data;
      console.log(`[HA] Received command from frontend: ${domain}.${service} on ${entityId}`);
      callService(domain, service, { entity_id: entityId, ...serviceData });
    });

    socket.on('ha_browse_media', (data, ack) => {
      console.log(`[HA] Browsing media for ${data.entity_id} (${data.media_content_type || 'root'})`);
      const payload = {
        type: 'media_player/browse_media',
        entity_id: data.entity_id
      };
      // Only include content_type and content_id if provided (root browse omits them)
      if (data.media_content_type) payload.media_content_type = data.media_content_type;
      if (data.media_content_id) payload.media_content_id = data.media_content_id;
      
      sendMessage(payload, (response) => {
        if (ack) ack(response);
      });
    });

    socket.on('ha_search_media', (data, ack) => {
      console.log(`[HA] Searching media for "${data.query}" on Music Assistant`);
      
      let maConfigEntryId = null;
      for (const [id, state] of cachedHaStates.entries()) {
        if (state.platform === 'music_assistant' && state.configEntryId) {
          maConfigEntryId = state.configEntryId;
          break;
        }
      }

      // Use call_service with return_response to get the search results directly
      const payload = {
        type: 'call_service',
        domain: 'music_assistant',
        service: 'search',
        service_data: {
          name: data.query,
          media_type: ['track', 'album', 'artist', 'playlist'],
          limit: 25,
          library_only: false,
          ...(maConfigEntryId && { config_entry_id: maConfigEntryId })
        },
        return_response: true
      };
      
      sendMessage(payload, (response) => {
        if (response && response.result && response.result.response) {
          // Transform MA search results into browse_media-like format for the frontend
          const raw = response.result.response || {};
          const children = [];
          
          // Process tracks
          if (raw.tracks) {
            raw.tracks.forEach(t => {
              children.push({
                title: `${t.name}${t.artists ? ' — ' + t.artists.map(a => a.name).join(', ') : ''}`,
                media_content_id: t.uri,
                media_content_type: 'music',
                media_class: 'track',
                can_play: true,
                can_expand: false,
                thumbnail: typeof t.image === 'string' ? t.image : (t.image?.url || t.metadata?.images?.[0]?.url || null)
              });
            });
          }
          // Process albums  
          if (raw.albums) {
            raw.albums.forEach(a => {
              children.push({
                title: `${a.name}${a.artists ? ' — ' + a.artists.map(ar => ar.name).join(', ') : ''}`,
                media_content_id: a.uri,
                media_content_type: 'music',
                media_class: 'album',
                can_play: true,
                can_expand: true,
                thumbnail: typeof a.image === 'string' ? a.image : (a.image?.url || a.metadata?.images?.[0]?.url || null)
              });
            });
          }
          // Process artists
          if (raw.artists) {
            raw.artists.forEach(a => {
              children.push({
                title: a.name,
                media_content_id: a.uri,
                media_content_type: 'music',
                media_class: 'artist',
                can_play: false,
                can_expand: true,
                thumbnail: typeof a.image === 'string' ? a.image : (a.image?.url || a.metadata?.images?.[0]?.url || null)
              });
            });
          }
          // Process playlists
          if (raw.playlists) {
            raw.playlists.forEach(p => {
              children.push({
                title: p.name,
                media_content_id: p.uri,
                media_content_type: 'playlist',
                media_class: 'playlist',
                can_play: true,
                can_expand: true,
                thumbnail: typeof p.image === 'string' ? p.image : (p.image?.url || p.metadata?.images?.[0]?.url || null)
              });
            });
          }
          
          if (ack) ack({ success: true, result: { children } });
        } else {
          console.log('[HA] Search response:', JSON.stringify(response));
          if (ack) ack({ success: false, result: { children: [] } });
        }
      });
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
      try {
        await publishStateToHA(updatedDevice);
      } catch (haErr) {
        console.error(`[HA PANEL SYNC] Failed to sync panel all-off:`, haErr.message);
      }
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
      try {
        await publishStateToHA(updatedDevice);
      } catch (haErr) {
        console.error(`[HA PANEL ACTION SYNC] Failed to sync:`, haErr.message);
      }
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
        Device.findOneAndUpdate({ deviceId }, updates, { returnDocument: 'after' }),
        publishToTopic(finalTopic, mqttPayload)
      ]);

      if (updatedDevice) {
        io.emit('device_state_update', updatedDevice);
        try {
          await publishStateToHA(updatedDevice);
        } catch (haErr) {
          console.error(`[HA SOCKET SYNC] Failed to sync ${deviceId} to HA:`, haErr.message);
        }
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
