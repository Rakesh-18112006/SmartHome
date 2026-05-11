import Automation from '../models/Automation.js';
import { publishToLight } from './mqttManager.js';
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
  const state = getState();

  console.log(`[AUTOMATION ENGINE] Executing action: ${action.command} on ${action.targetDevice}`);

  switch (action.command) {
    case 'turn_on':
      updateState({ state: 'ON' });
      await publishToLight({ ...getState(), state: 'ON' });
      break;

    case 'turn_off':
      updateState({ state: 'OFF' });
      await publishToLight({ ...getState(), state: 'OFF' });
      break;

    case 'set_brightness':
      const brightness = action.params?.brightness ?? 255;
      updateState({ brightness, state: 'ON' });
      await publishToLight({ ...getState(), brightness, state: 'ON' });
      break;

    case 'set_color':
      const color = action.params?.color || [255, 255, 255, 255];
      updateState({ color, state: 'ON', effect: 'solid' });
      await publishToLight({ ...getState() });
      break;

    case 'set_effect':
      const effect = action.params?.effect || 'solid';
      updateState({ effect, state: 'ON' });
      await publishToLight({ ...getState() });
      break;

    default:
      console.warn(`[AUTOMATION ENGINE] Unknown command: ${action.command}`);
  }

  // Broadcast updated state to all connected clients
  if (io) {
    io.emit('device_state_update', getState());
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
