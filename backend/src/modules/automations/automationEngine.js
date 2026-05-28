import Automation from './Automation.js';
import Device from '../devices/Device.js';
import { publishToLight, publishToTopic } from '../../integrations/mqtt/mqttManager.js';
import { getState, updateState } from '../devices/deviceState.js';
import { callService } from '../../integrations/homeassistant/ha-client.js';

const ACTION_EXECUTION_DELAY_MS = 250;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Automation Engine
 * 
 * Evaluates all enabled automation rules against current sensor data.
 * When conditions are met, executes the configured actions.
 * 
 * LOOP PREVENTION:
 * 1. Execution lock – prevents re-evaluation while actions are running
 * 2. Per-rule state tracking – only fires when condition transitions from false→true
 * 3. Post-execution suppression – ignores MQTT echoes for a brief window after actions
 * 4. Cooldown timer – existing per-rule cooldown from the schema
 */

// Current sensor readings (updated by MQTT messages)
let sensorData = {
  temperature: 25,
  humidity: 50,
  lux: 0,
  motion: false,
};

// ── Loop Prevention State ──
let _isExecuting = false;                    // True while actions are being executed
let _suppressUntil = 0;                       // Timestamp: ignore evaluations until this time
const SUPPRESSION_WINDOW_MS = 2000;           // 2-second window after execution to ignore echoes
const _previousConditionState = new Map();    // ruleId → boolean (was condition met last time?)

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
 * Check if the automation engine is currently executing actions.
 * External callers (like mqtt.js) can use this to skip evaluation.
 */
export function isEngineExecuting() {
  return _isExecuting || Date.now() < _suppressUntil;
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

    if (targetDeviceId && targetDeviceId.includes('.')) {
      console.log(`[AUTOMATION ENGINE] Routing HA action: ${command} on entity ${targetDeviceId}`);
      const domain = targetDeviceId.split('.')[0];
      let service = command;
      let serviceData = params || {};
      
      if (domain === 'media_player') {
        if (command === 'turn_off') service = 'media_pause';
        else if (command === 'turn_on') service = 'media_play';
      }

      try {
        await callService(domain, service, { entity_id: targetDeviceId, ...serviceData });
      } catch (err) {
        console.error(`[AUTOMATION ENGINE] Failed to route HA action for ${targetDeviceId}:`, err.message);
      }
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

    // Determine default topic and payload for RGBW lights if they are of that type
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
        // Execute in parallel
        const [updatedDevice] = await Promise.all([
          Device.findOneAndUpdate({ deviceId: targetDeviceId }, {
            on: (command !== 'turn_off'),
            ...(command === 'set_brightness' && { brightness: params.brightness }),
            ...(command === 'set_color' && { spectrumRgb: (params.color[0] << 16) | (params.color[1] << 8) | params.color[2] })
          }, { returnDocument: 'after' }),
          publishToTopic(topic, payload)
        ]);

        if (io && updatedDevice) io.emit('device_state_update', updatedDevice);
        return;
      }
    }

    if (targetDeviceId.startsWith('BSQ') || device.type === 'touch-panel') {
      // Touch Panel Logic (Multi-channel)
      topic = `touch-panel/${targetDeviceId}/switch/command`;
      const idx = subDeviceIndex !== null && subDeviceIndex !== undefined ? Number(subDeviceIndex) : 0;
      const matchedSubDevice = Array.isArray(device.subDevices)
        ? device.subDevices.find(sd => Number(sd.index) === idx)
        : null;
      
      if (command === 'turn_on' || command === 'turn_off') {
        if (matchedSubDevice?.type === 'fan') {
          const nextSpeed = Math.max(1, Number(params?.speed) || Number(matchedSubDevice.speed) || 1);

          await publishToTopic(topic, {
            entityId: targetDeviceId,
            type: 'switch',
            value: `${idx}${command === 'turn_on' ? '1' : '0'}`
          });

          if (command === 'turn_on') {
            await sleep(120);
            await publishToTopic(topic, {
              entityId: targetDeviceId,
              type: 'dimmer',
              dimmer: String(idx),
              value: String(nextSpeed)
            });
            matchedSubDevice.speed = nextSpeed;
          }

          matchedSubDevice.on = (command === 'turn_on');
          await device.save();
          if (io) io.emit('device_state_update', device);
          return;
        } else {
          payload = {
            entityId: targetDeviceId,
            type: 'switch',
            value: `${idx}${command === 'turn_on' ? '1' : '0'}`
          };
          // Update local DB state
          if (matchedSubDevice) {
            matchedSubDevice.on = (command === 'turn_on');
          }
        }
      } else if (command === 'set_speed') {
        if (matchedSubDevice?.type === 'fan') {
          await publishToTopic(topic, {
            entityId: targetDeviceId,
            type: 'switch',
            value: `${idx}1`
          });
          await sleep(120);
          payload = {
            entityId: targetDeviceId,
            type: 'dimmer',
            dimmer: String(idx),
            value: String(params?.speed || 1)
          };
          matchedSubDevice.speed = params?.speed || 1;
          matchedSubDevice.on = true;
        }
      }
    } else if (targetDeviceId.startsWith('BSP') || device.type === 'plug' || device.type === 'switch') {
      // Smart Plug / Single Channel Switch
      topic = `smart-switch/command/${targetDeviceId}`;
      const status = (command === 'turn_on' ? 'ON' : 'OFF');
      payload = { entityId: targetDeviceId, relayStatus: status };
      device.on = (command === 'turn_on');
    } else if (device.type === 'curtain') {
      // Specialized Curtain/Touch-Panel Logic (e.g. BS900000001)
      topic = `touch-panel/${targetDeviceId}/switch/command`;
      if (command === 'turn_on' || command === 'turn_off') {
        const startValue = command === 'turn_on' ? '11' : '21';
        const stopValue = command === 'turn_on' ? '10' : '20';
        
        // 1. Send Start Command
        payload = { type: 'switch', value: startValue };
        await publishToTopic(topic, payload);
        
        // 2. Wait 5 seconds
        console.log(`[AUTOMATION ENGINE] Curtain ${targetDeviceId} moving, waiting 5s to stop...`);
        setTimeout(async () => {
          try {
            await publishToTopic(topic, { type: 'switch', value: stopValue });
            console.log(`[AUTOMATION ENGINE] Curtain ${targetDeviceId} stopped.`);
          } catch (err) {
            console.error(`[AUTOMATION ENGINE] Error stopping curtain ${targetDeviceId}:`, err);
          }
        }, 5000);

        device.on = (command === 'turn_on');
        await device.save();
        if (io) io.emit('device_state_update', device);
        payload = {}; // Prevent duplicate publish at the end of the function
      }
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
 * 
 * LOOP PREVENTION: This function will bail out if:
 *   - Actions are currently being executed (_isExecuting)
 *   - We are within the post-execution suppression window
 *   - A rule's conditions haven't transitioned (were already met before)
 */
export async function evaluateAutomations(io) {
  // ── Guard: don't re-enter while executing or during suppression window ──
  if (_isExecuting) {
    console.log('[AUTOMATION ENGINE] ⏸ Skipping evaluation – actions in progress');
    return;
  }
  if (Date.now() < _suppressUntil) {
    console.log('[AUTOMATION ENGINE] ⏸ Skipping evaluation – in post-execution suppression window');
    return;
  }

  try {
    const rules = await Automation.find({ enabled: true });

    for (const rule of rules) {
      const ruleId = rule._id.toString();

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

      // ── Edge-trigger: only fire on FALSE → TRUE transition ──
      const wasPreviouslyMet = _previousConditionState.get(ruleId) || false;
      _previousConditionState.set(ruleId, conditionsMet);

      if (!conditionsMet) {
        continue; // Conditions not met, nothing to do
      }

      if (wasPreviouslyMet) {
        // Conditions were already met last time – don't re-fire (edge-trigger)
        continue;
      }

      console.log(`[AUTOMATION ENGINE] ✅ Rule "${rule.name}" triggered!`);

      // ── Lock execution to prevent recursive evaluation ──
      _isExecuting = true;

      try {
        // Execute all actions
        for (let actionIndex = 0; actionIndex < rule.actions.length; actionIndex += 1) {
          const action = rule.actions[actionIndex];
          await executeAction(action, io);
          if (actionIndex < rule.actions.length - 1) {
            await sleep(ACTION_EXECUTION_DELAY_MS);
          }
        }
      } finally {
        // Unlock execution and start suppression window
        _isExecuting = false;
        _suppressUntil = Date.now() + SUPPRESSION_WINDOW_MS;
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
  } catch (err) {
    console.error('[AUTOMATION ENGINE] Error evaluating automations:', err);
    // Always reset lock on error to prevent permanent deadlock
    _isExecuting = false;
  }
}
