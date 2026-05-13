import Device from '../models/Device.js';
import { publishToTopic } from '../services/mqttManager.js';

/**
 * Handle SYNC intent
 * Returns the list of devices the user has linked to Google Assistant.
 */
function handleSync(requestId) {
  const syncResponse = {
    requestId,
    payload: {
      agentUserId: 'smarthome-user-1',
      devices: [
        {
          id: 'light-1',
          type: 'action.devices.types.LIGHT',
          traits: [
            'action.devices.traits.OnOff',
            'action.devices.traits.Brightness',
            'action.devices.traits.ColorSetting',
            'action.devices.traits.Modes',
          ],
          attributes: {
            colorModel: 'rgb',
            colorTemperatureRange: {
              temperatureMinK: 2000,
              temperatureMaxK: 9000
            },
            availableModes: [{
              name: 'lighting_mode',
              name_values: [{
                name_synonym: ['lighting mode', 'light mode', 'mode'],
                lang: 'en'
              }],
              settings: [{
                setting_name: 'solid',
                setting_values: [{
                  setting_synonym: ['manual', 'normal', 'solid'],
                  lang: 'en'
                }]
              }, {
                setting_name: 'auto',
                setting_values: [{
                  setting_synonym: ['auto', 'automatic', 'sensor'],
                  lang: 'en'
                }]
              }, {
                setting_name: 'auto_white',
                setting_values: [{
                  setting_synonym: ['white', 'pure white', 'reading'],
                  lang: 'en'
                }]
              }],
              ordered: false
            }]
          },
          name: {
            defaultNames: ['Smart Light'],
            name: 'Smart Light',
            nicknames: ['Living Room Light'],
          },
          willReportState: false,
          roomHint: 'Living Room',
          deviceInfo: {
            manufacturer: 'SmartHome Inc',
            model: 'SH-Light-1',
            hwVersion: '1.0',
            swVersion: '1.0',
          },
        },
      ],
    },
  };

  console.log('[SYNC Response]', JSON.stringify(syncResponse, null, 2));
  return syncResponse;
}

/**
 * Handle QUERY intent
 * Fetches current device state from MongoDB and returns it.
 */
async function handleQuery(requestId, payload) {
  const { devices } = payload;
  const deviceStates = {};

  for (const device of devices) {
    const dbDevice = await Device.findOne({ deviceId: device.id });

    if (dbDevice) {
      deviceStates[device.id] = {
        on: dbDevice.on,
        brightness: dbDevice.brightness,
        color: {
          spectrumRgb: dbDevice.spectrumRgb,
        },
        currentModeSettings: {
          lighting_mode: dbDevice.effect || 'solid'
        },
        online: true,
        status: 'SUCCESS',
      };
    } else {
      deviceStates[device.id] = {
        online: false,
        status: 'ERROR',
        errorCode: 'deviceNotFound',
      };
    }
  }

  const queryResponse = {
    requestId,
    payload: {
      devices: deviceStates,
    },
  };

  console.log('[QUERY Response]', JSON.stringify(queryResponse, null, 2));
  return queryResponse;
}

/**
 * Handle EXECUTE intent
 * Processes commands (OnOff, BrightnessAbsolute) and updates MongoDB.
 */
async function handleExecute(requestId, payload) {
  const { commands } = payload;
  const results = [];

  for (const command of commands) {
    for (const device of command.devices) {
      for (const execution of command.execution) {
        const update = {};

        switch (execution.command) {
          case 'action.devices.commands.OnOff':
            update.on = execution.params.on;
            break;

          case 'action.devices.commands.BrightnessAbsolute':
            update.brightness = execution.params.brightness;
            break;

          case 'action.devices.commands.ColorAbsolute':
            if (execution.params.color && execution.params.color.spectrumRGB) {
              update.spectrumRgb = execution.params.color.spectrumRGB;
              update.effect = 'solid'; // Change color sets it back to manual solid
            }
            break;

          case 'action.devices.commands.SetModes':
            if (execution.params.updateModeSettings && execution.params.updateModeSettings.lighting_mode) {
              update.effect = execution.params.updateModeSettings.lighting_mode;
            }
            break;

          default:
            console.warn(`[EXECUTE] Unknown command: ${execution.command}`);
            results.push({
              ids: [device.id],
              status: 'ERROR',
              errorCode: 'functionNotSupported',
            });
            continue;
        }

        // Update the device in MongoDB
        const updatedDevice = await Device.findOneAndUpdate(
          { deviceId: device.id },
          update,
          { returnDocument: 'after', upsert: true }
        );

        console.log(`[EXECUTE] Updated device ${device.id}:`, update);

        // ─── Bridge to physical MQTT light ───
        try {
          const mqttPayload = {};

          if (execution.command === 'action.devices.commands.OnOff') {
            mqttPayload.state = updatedDevice.on ? 'ON' : 'OFF';
            // When turning ON, send current brightness; when OFF, send 0
            mqttPayload.brightness = updatedDevice.on
              ? Math.round((updatedDevice.brightness / 100) * 255)
              : 0;
            
            // Send current color when turning ON to avoid defaulting to black
            if (updatedDevice.on) {
              const rgb = updatedDevice.spectrumRgb || 16777215;
              mqttPayload.color = [
                (rgb >> 16) & 0xFF,
                (rgb >> 8) & 0xFF,
                rgb & 0xFF,
                255 // Add white channel for better glow
              ];
            }
          }

          if (execution.command === 'action.devices.commands.BrightnessAbsolute') {
            mqttPayload.state = 'ON';
            // Map Google's 0-100% to hardware's 0-255
            mqttPayload.brightness = Math.round((updatedDevice.brightness / 100) * 255);
          }

          if (execution.command === 'action.devices.commands.ColorAbsolute') {
            mqttPayload.state = 'ON';
            mqttPayload.effect = 'solid';
            const rgb = updatedDevice.spectrumRgb || 16777215;
            const r = (rgb >> 16) & 0xFF;
            const g = (rgb >> 8) & 0xFF;
            const b = rgb & 0xFF;
            mqttPayload.color = [r, g, b, 0];
          }

          if (execution.command === 'action.devices.commands.SetModes') {
            mqttPayload.state = 'ON';
            mqttPayload.effect = updatedDevice.effect;
          }

          const targetTopic = updatedDevice.topic || `smarthome/${updatedDevice.type}/${updatedDevice.deviceId}`;
          await publishToTopic(targetTopic, mqttPayload);
          console.log(`[MQTT BRIDGE] Sent to topic ${targetTopic}:`, mqttPayload);
        } catch (mqttErr) {
          console.error(`[MQTT BRIDGE] Failed to send to physical light:`, mqttErr.message);
          // Don't fail the Google response — the DB is already updated
        }
        // ─────────────────────────────────────

        results.push({
          ids: [device.id],
          status: 'SUCCESS',
          states: {
            on: updatedDevice.on,
            brightness: updatedDevice.brightness,
            color: {
              spectrumRgb: updatedDevice.spectrumRgb,
            },
            currentModeSettings: {
              lighting_mode: updatedDevice.effect || 'solid'
            },
            online: true,
          },
        });
      }
    }
  }

  const executeResponse = {
    requestId,
    payload: {
      commands: results,
    },
  };

  console.log('[EXECUTE Response]', JSON.stringify(executeResponse, null, 2));
  return executeResponse;
}

/**
 * Main fulfillment handler — routes incoming intents.
 */
export async function smarthomeFulfillment(req, res) {
  const { requestId, inputs } = req.body;

  console.log('\n========== Incoming Smart Home Request ==========');
  console.log(JSON.stringify(req.body, null, 2));
  console.log('=================================================\n');

  if (!inputs || inputs.length === 0) {
    console.error('[ERROR] No inputs in request body');
    return res.status(400).json({ error: 'No inputs provided' });
  }

  const intent = inputs[0].intent;
  let response;

  try {
    switch (intent) {
      case 'action.devices.SYNC':
        response = handleSync(requestId);
        break;

      case 'action.devices.QUERY':
        response = await handleQuery(requestId, inputs[0].payload);
        break;

      case 'action.devices.EXECUTE':
        response = await handleExecute(requestId, inputs[0].payload);
        break;

      default:
        console.error(`[ERROR] Unknown intent: ${intent}`);
        response = {
          requestId,
          payload: { errorCode: 'notSupported' },
        };
    }

    console.log('\n========== Smart Home Response ==========');
    console.log(JSON.stringify(response, null, 2));
    console.log('=========================================\n');

    return res.json(response);
  } catch (error) {
    console.error('[ERROR] Smart Home fulfillment error:', error);
    return res.status(500).json({
      requestId,
      payload: {
        errorCode: 'hardError',
        debugString: error.message,
      },
    });
  }
}

/**
 * Fake OAuth authorization endpoint for Google Actions Console.
 * 
 * Google sends the user here with query params:
 *   - client_id, redirect_uri, state, response_type
 * 
 * We must redirect back to Google's redirect_uri with:
 *   ?code=FAKE_AUTH_CODE&state=<original_state>
 */
export function fakeAuth(req, res) {
  const { redirect_uri, state } = req.query;

  console.log('[FAKEAUTH] Authorization endpoint hit');
  console.log('[FAKEAUTH] Query params:', JSON.stringify(req.query, null, 2));

  if (!redirect_uri) {
    // If no redirect_uri (manual browser test), just show success
    return res.json({
      success: true,
      message: 'Fake authorization endpoint is working. Google will send redirect_uri param during actual linking.',
    });
  }

  // Build the redirect URL back to Google with an authorization code
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set('code', 'fake-auth-code');
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  console.log('[FAKEAUTH] Redirecting to:', redirectUrl.toString());
  return res.redirect(redirectUrl.toString());
}

/**
 * Fake OAuth token endpoint for Google Actions Console.
 * 
 * Google calls this endpoint twice:
 *   1. To exchange authorization_code for access_token + refresh_token
 *   2. To use refresh_token to get a new access_token
 */
export function fakeToken(req, res) {
  const { grant_type } = req.body;

  console.log('[FAKETOKEN] Token endpoint hit');
  console.log('[FAKETOKEN] Body:', JSON.stringify(req.body, null, 2));

  if (grant_type === 'authorization_code') {
    // Exchange auth code for tokens
    console.log('[FAKETOKEN] Exchanging authorization code for tokens');
    return res.json({
      token_type: 'bearer',
      access_token: 'fake-access-token',
      refresh_token: 'fake-refresh-token',
      expires_in: 3600,
    });
  } else if (grant_type === 'refresh_token') {
    // Refresh the access token
    console.log('[FAKETOKEN] Refreshing access token');
    return res.json({
      token_type: 'bearer',
      access_token: 'fake-access-token',
      expires_in: 3600,
    });
  }

  // Fallback — return tokens anyway
  console.log('[FAKETOKEN] Unknown grant_type, returning tokens anyway');
  return res.json({
    token_type: 'bearer',
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    expires_in: 3600,
  });
}
