import Automation from '../models/Automation.js';
import Device from '../models/Device.js';
import { publishToLight, publishToTopic } from './mqttManager.js';
import { getState, updateState } from './deviceState.js';

/**
 * Automation Engine
 * 
 * Evaluates all enabled automation rules against current sensor data.
 * When conditions are met, executes the configured actions.
 */

// Current sensor readings (updated by MQTT messages)
let sensorData = {
  temperature: 25,
  humidity: 50,
  lux: 0,
  motion: false,
};

/**
 * Update sensor readings from MQTT or any other source.
 */
export function updateSensorData(updates) {
  sensorData = { ...sensorData, ...updates };
  return sensorData;
}

/**
 * Get current sensor readings.
 */
export function getSensorData() {
  return { ...sensorData };
}

/**
 * Evaluate a single condition against current sensor data.
 */
function evaluateCondition(condition) {
  const currentValue = sensorData[condition.sensor];
  if (currentValue === undefined) return false;

  const targetValue = Number(condition.value);

  switch (condition.operator) {
    case 'gt':  return currentValue > targetValue;
    case 'lt':  return currentValue < targetValue;
    case 'eq':  return currentValue === targetValue;
    case 'gte': return currentValue >= targetValue;
    case 'lte': return currentValue <= targetValue;
    case 'neq': return currentValue !== targetValue;
    default:    return false;
  }
}

/**
 * Execute a single action on a device.
 */
async function executeAction(action, io) {
  try {
    const { targetDeviceId, subDeviceIndex, command, params } = action;
    console.log(`[AUTOMATION ENGINE] Executing action: ${command} on ${targetDeviceId} (Sub: ${subDeviceIndex})`);

    // Special handling for the legacy RGBW light (if used)
    if (targetDeviceId === 'light-1') {
      const state = getState();
      switch (command) {
        case 'turn_on':
          updateState({ state: 'ON' });
          await publishToLight({ ...getState(), state: 'ON' });
          break;
        case 'turn_off':
          updateState({ state: 'OFF' });
          await publishToLight({ ...getState(), state: 'OFF' });
          break;
        case 'set_brightness':
          const brightness = params?.brightness ?? 255;
          updateState({ brightness, state: 'ON' });
          await publishToLight({ ...getState(), brightness, state: 'ON' });
          break;
        case 'set_color':
          const color = params?.color || [255, 255, 255, 255];
          updateState({ color, state: 'ON', effect: 'solid' });
          await publishToLight({ ...getState() });
          break;
        case 'set_effect':
          const effect = params?.effect || 'solid';
          updateState({ effect, state: 'ON' });
          await publishToLight({ ...getState() });
          break;
      }
      if (io) io.emit('device_state_update', getState());
      return;
    }

    // Generic device handling
    const device = await Device.findOne({ deviceId: targetDeviceId });
    if (!device) {
      console.warn(`[AUTOMATION ENGINE] Device not found: ${targetDeviceId}`);
      return;
    }

    let topic = '';
    let payload = {};

    if (targetDeviceId.startsWith('BSQ')) {
      // Touch Panel Logic
      topic = `touch-panel/${targetDeviceId}/switch/command`;
      const idx = subDeviceIndex !== null ? subDeviceIndex : 0;
      
      if (command === 'turn_on' || command === 'turn_off') {
        payload = { index: idx, status: command === 'turn_on' ? 1 : 0 };
        // Update local DB state
        if (device.subDevices && device.subDevices[idx]) {
          device.subDevices[idx].on = (command === 'turn_on');
        }
      } else if (command === 'set_speed') {
        // Find which subdevice is the fan
        const fanIndex = device.subDevices.findIndex(sd => sd.type === 'fan');
        if (fanIndex !== -1) {
          topic = `touch-panel/${targetDeviceId}/dimmer/command`;
          payload = { index: 0, status: params?.speed || 1 }; // Typically 1 dimmer per panel
          device.subDevices[fanIndex].speed = params?.speed || 1;
          device.subDevices[fanIndex].on = true;
        }
      }
    } else if (targetDeviceId.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
      // Smart Plug / Single Channel Switch
      topic = `smart-switch/command/${targetDeviceId}`;
      const status = (command === 'turn_on' ? 'ON' : 'OFF');
      payload = { entityId: targetDeviceId, relayStatus: status };
      device.on = (command === 'turn_on');
    }

    if (topic && Object.keys(payload).length > 0) {
      await publishToTopic(topic, payload);
      await device.save();
      if (io) io.emit('device_state_update', device);
    }

  } catch (err) {
    console.error('[AUTOMATION ENGINE] Error executing action:', err);
  }
}

/**
 * Evaluate all enabled automation rules and execute matching ones.
 * Called whenever sensor data changes.
 */
export async function evaluateAutomations(io) {
  try {
    const rules = await Automation.find({ enabled: true });

    for (const rule of rules) {
      // Check cooldown
      if (rule.lastTriggered) {
        const elapsed = (Date.now() - rule.lastTriggered.getTime()) / 1000;
        if (elapsed < rule.cooldownSeconds) {
          continue; // Still in cooldown
        }
      }

      // Evaluate conditions
      const results = rule.conditions.map(evaluateCondition);
      const conditionsMet = rule.conditionLogic === 'all'
        ? results.every(Boolean)
        : results.some(Boolean);

      if (conditionsMet) {
        console.log(`[AUTOMATION ENGINE] ✅ Rule "${rule.name}" triggered!`);

        // Execute all actions
        for (const action of rule.actions) {
          await executeAction(action, io);
        }

        // Update trigger metadata
        rule.lastTriggered = new Date();
        rule.triggerCount += 1;
        await rule.save();

        // Notify frontend about the trigger
        if (io) {
          io.emit('automation_triggered', {
            ruleId: rule._id,
            ruleName: rule.name,
            triggeredAt: rule.lastTriggered,
            triggerCount: rule.triggerCount,
          });
        }
      }
    }
  } catch (err) {
    console.error('[AUTOMATION ENGINE] Error evaluating automations:', err);
  }
}
