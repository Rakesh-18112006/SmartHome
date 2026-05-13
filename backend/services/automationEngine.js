import Automation from '../models/Automation.js';
import Device from '../models/Device.js';
import { publishToTopic } from './mqttManager.js';
import { getDevice, updateDeviceCache } from './cacheService.js';

/**
 * Automation Engine
 * Evaluates all enabled automation rules against current sensor data.
 */

// Current sensor readings (updated by MQTT messages)
let sensorData = {
  temperature: 25,
  humidity: 50,
  lux: 0,
  motion: false,
};

// Cache for enabled automations to avoid DB hits on every sensor update
let cachedAutomations = [];
let lastCacheUpdate = 0;

export function updateSensorData(updates) {
  sensorData = { ...sensorData, ...updates };
  return sensorData;
}

export function getSensorData() {
  return { ...sensorData };
}

async function getEnabledAutomations() {
  const now = Date.now();
  if (now - lastCacheUpdate > 60000 || cachedAutomations.length === 0) { // Refresh every 1 min
    cachedAutomations = await Automation.find({ enabled: true });
    lastCacheUpdate = now;
  }
  return cachedAutomations;
}

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
    console.log(`[AUTOMATION ENGINE] Executing action: ${command} on ${targetDeviceId}`);

    const device = await getDevice(targetDeviceId);
    if (!device) return;

    // Manual Override check
    if (device.manualOverrideUntil && device.manualOverrideUntil > new Date()) {
      return; 
    }

    let topic = '';
    let payload = {};

    // Standard RGBW/Light handling
    if (device.type === 'rgbw' || device.type === 'light') {
      topic = `smart_home/rgbw/${targetDeviceId}/command`;
      switch (command) {
        case 'turn_on':   payload = { state: 'ON' }; break;
        case 'turn_off':  payload = { state: 'OFF' }; break;
        case 'set_brightness': payload = { state: 'ON', brightness: params?.brightness ?? 255 }; break;
        case 'set_color': payload = { state: 'ON', effect: 'solid', color: params?.color || [255, 255, 255, 255] }; break;
        case 'set_effect': payload = { state: 'ON', effect: params?.effect || 'solid' }; break;
      }
      
      if (topic && Object.keys(payload).length > 0) {
        publishToTopic(topic, payload).catch(err => console.error(err));

        const updatedDevice = await Device.findOneAndUpdate({ deviceId: targetDeviceId }, {
          on: (command !== 'turn_off'),
          ...(command === 'set_brightness' && { brightness: params.brightness }),
          ...(command === 'set_color' && { spectrumRgb: (params.color[0] << 16) | (params.color[1] << 8) | params.color[2] })
        }, { returnDocument: 'after' });

        if (io && updatedDevice) {
          updateDeviceCache(targetDeviceId, updatedDevice);
          io.emit('device_state_update', updatedDevice);
        }
        return;
      }
    }

    // Touch Panel / Curtain logic
    if (targetDeviceId.startsWith('BSQ')) {
      topic = `touch-panel/${targetDeviceId}/switch/command`;
      const idx = subDeviceIndex !== null ? subDeviceIndex : 0;
      if (command === 'turn_on' || command === 'turn_off') {
        payload = { index: idx, status: command === 'turn_on' ? 1 : 0 };
      }
    } else if (targetDeviceId.startsWith('BS')) {
      topic = `touch-panel/${targetDeviceId}/switch/command`;
      if (command === 'turn_on' || command === 'turn_off') {
        const startValue = command === 'turn_on' ? '11' : '21';
        const stopValue = command === 'turn_on' ? '10' : '20';
        publishToTopic(topic, { type: 'switch', value: startValue });
        setTimeout(() => publishToTopic(topic, { type: 'switch', value: stopValue }), 5000);
        return;
      }
    } else if (targetDeviceId.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
      topic = `smart-switch/command/${targetDeviceId}`;
      payload = { entityId: targetDeviceId, relayStatus: (command === 'turn_on' ? 'ON' : 'OFF') };
    }

    if (topic && Object.keys(payload).length > 0) {
      publishToTopic(topic, payload).catch(err => console.error(err));
      const updatedDevice = await Device.findOneAndUpdate(
        { deviceId: targetDeviceId }, 
        { on: (command === 'turn_on') }, 
        { returnDocument: 'after' }
      );
      if (io && updatedDevice) {
        updateDeviceCache(targetDeviceId, updatedDevice);
        io.emit('device_state_update', updatedDevice);
      }
    }
  } catch (err) {
    console.error('[AUTOMATION ENGINE] Error executing action:', err);
  }
}

/**
 * Evaluate all enabled automation rules.
 */
export async function evaluateAutomations(io) {
  try {
    const rules = await getEnabledAutomations();

    const triggerPromises = rules.map(async (rule) => {
      if (rule.lastTriggered && (Date.now() - rule.lastTriggered.getTime()) < rule.cooldownSeconds * 1000) {
        return;
      }

      const results = rule.conditions.map(evaluateCondition);
      const conditionsMet = rule.conditionLogic === 'all' ? results.every(Boolean) : results.some(Boolean);

      if (conditionsMet) {
        console.log(`[AUTOMATION ENGINE] Rule "${rule.name}" triggered!`);
        await Promise.all(rule.actions.map(action => executeAction(action, io)));

        rule.lastTriggered = new Date();
        rule.triggerCount += 1;
        Automation.updateOne({ _id: rule._id }, { 
          lastTriggered: rule.lastTriggered, 
          triggerCount: rule.triggerCount 
        }).catch(err => console.error(err));

        if (io) {
          io.emit('automation_triggered', {
            ruleId: rule._id,
            ruleName: rule.name,
            triggeredAt: rule.lastTriggered,
            triggerCount: rule.triggerCount,
          });
        }
      }
    });

    await Promise.all(triggerPromises);
  } catch (err) {
    console.error('[AUTOMATION ENGINE] Error evaluating automations:', err);
  }
}
