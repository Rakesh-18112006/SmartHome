/**
 * Shared MQTT Manager
 * Allows the Smart Home controller (and any other module) to publish
 * commands to the physical MQTT light without circular imports.
 */

const MQTT_COMMAND_TOPIC = 'rgbw-light/1234/light/command';

let _mqttClient = null;

/**
 * Set the MQTT client reference (called once from server.js after connection).
 */
export function setMqttClient(client) {
  _mqttClient = client;
}

/**
 * Get the current MQTT client.
 */
export function getMqttClient() {
  return _mqttClient;
}

/**
 * Publish a command to the physical MQTT light.
 * @param {object} payload - The JSON payload to send
 * @returns {Promise<boolean>} - Whether the publish succeeded
 */
export function publishToLight(payload) {
  return new Promise((resolve, reject) => {
    if (!_mqttClient || !_mqttClient.connected) {
      console.warn('[MQTT BRIDGE] MQTT client not connected, skipping publish');
      return resolve(false);
    }

    const message = JSON.stringify(payload);
    _mqttClient.publish(MQTT_COMMAND_TOPIC, message, (err) => {
      if (err) {
        console.error('[MQTT BRIDGE] Publish error:', err.message);
        return reject(err);
      }
      console.log(`[MQTT BRIDGE] Published to ${MQTT_COMMAND_TOPIC}: ${message}`);
      return resolve(true);
    });
  });
}

export { MQTT_COMMAND_TOPIC };
