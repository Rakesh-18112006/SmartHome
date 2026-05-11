import { publishToLight } from './mqttManager.js';
import { getState, updateState } from './deviceState.js';
import { getSensorData, updateSensorData, evaluateAutomations } from './automationEngine.js';

export const initSocket = (io, mqttClient) => {
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send initial state to client
    socket.emit('device_state_update', getState());
    socket.emit('sensor_data_update', getSensorData());

    socket.on('color_change', async (data) => {
      const state = getState();
      state.effect = 'solid'; // Switching color drops auto mode
      state.autoMode = false;
      
      state.color[0] = data.r !== undefined ? data.r : state.color[0];
      state.color[1] = data.g !== undefined ? data.g : state.color[1];
      state.color[2] = data.b !== undefined ? data.b : state.color[2];
      state.color[3] = data.w !== undefined ? data.w : state.color[3];
      
      await publishToLight(state);
      io.emit('device_state_update', state);
    });

    socket.on('power_toggle', async (data) => {
      const state = updateState({ state: data.state });
      await publishToLight(state);
      io.emit('device_state_update', state);
    });

    socket.on('brightness_change', async (data) => {
      const state = getState();
      if (state.autoMode) return; // Prevent manual change in auto mode

      state.brightness = data.brightness;
      await publishToLight(state);
      io.emit('device_state_update', state);
    });

    socket.on('white_change', async (data) => {
      const state = getState();
      state.color[3] = data.white;
      await publishToLight(state);
      io.emit('device_state_update', state);
    });

    socket.on('toggle_auto_mode', async (data) => {
      const state = updateState({ 
        autoMode: data.enabled,
        effect: data.enabled ? 'auto' : 'solid'
      });
      
      await publishToLight(state);
      console.log(`[AUTO MODE] ${data.enabled ? 'Enabled' : 'Disabled'}`);
      io.emit('device_state_update', state);
    });

    socket.on('force_white_mode', async () => {
      const state = getState();
      state.state = 'ON';
      state.autoMode = true;
      state.effect = 'auto_white'; // Use the new effect defined in ESP8266
      
      await publishToLight(state);
      io.emit('device_state_update', state);
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
