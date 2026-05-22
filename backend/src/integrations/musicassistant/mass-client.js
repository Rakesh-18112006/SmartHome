import WebSocket from 'ws';
// removed getIO
import { callService } from '../homeassistant/ha-client.js';

let ws = null;
let msgId = 1;
const pendingRequests = new Map();
let isConnected = false;

const MA_URL = process.env.MASS_URL || 'ws://192.168.0.139:8095/ws';
const TOKEN = process.env.MASS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJIbkxSQ3ktUHF6WG9mWV9zZE9KWXRZamtNWHpXSEZwSTlXblBNdzJXamcwIiwianRpIjoiRHFRQ0dFcUZWbU0yV0N3ak9JLTBmc3RaN09iM1R5N2J6WEwyelVVQ2tVOCIsImlhdCI6MTc3OTQyOTMxNywiZXhwIjoyMDk0Nzg5MzE3LCJ1c2VybmFtZSI6ImNvcmFsaW5ub3ZhdGlvbnMiLCJyb2xlIjoiYWRtaW4iLCJ0b2tlbl9uYW1lIjoiU21hcnRIb21lIiwiaXNfbG9uZ19saXZlZCI6dHJ1ZX0.iPGhvH2428kjFDhoXaEm2agbkhtof167kGz1Aps10kM';

export function connectMA() {
  if (ws) ws.close();
  ws = new WebSocket(MA_URL);

  ws.on('open', () => {
    console.log('Connected to Music Assistant WS');
    // Send auth
    ws.send(JSON.stringify({
      message_id: String(msgId++),
      command: "auth",
      args: { token: TOKEN }
    }));
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    
    // Handle Auth Response
    if (msg.result?.authenticated) {
      console.log('Music Assistant Authenticated');
      isConnected = true;
      // Subscribe to state changes if MA supports an event bus, 
      // but HA already sends player state updates so we can rely on HA for state updates.
    }

    if (msg.message_id && pendingRequests.has(String(msg.message_id))) {
      const { resolve, reject } = pendingRequests.get(String(msg.message_id));
      if (msg.error_code) {
        reject(msg);
      } else {
        resolve(msg.result);
      }
      pendingRequests.delete(String(msg.message_id));
    }
  });

  ws.on('close', () => {
    console.log('Music Assistant WS disconnected. Reconnecting in 5s...');
    isConnected = false;
    setTimeout(connectMA, 5000);
  });

  ws.on('error', (err) => {
    console.error('Music Assistant WS error:', err.message);
  });
}

export function sendMACommand(command, args = {}) {
  return new Promise((resolve, reject) => {
    if (!isConnected || !ws) return reject(new Error('MA Not Connected'));
    const id = String(msgId++);
    pendingRequests.set(id, { resolve, reject });
    ws.send(JSON.stringify({
      message_id: id,
      command,
      args
    }));
    
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        reject(new Error('MA Command Timeout'));
      }
    }, 10000);
  });
}

// Setup Socket.IO endpoints for frontend
export function setupMASocketEvents(socket) {
  socket.on('mass_browse_media', async (payload, callback) => {
    try {
      // payload: { path: "..." }
      const path = payload.path || 'builtin://';
      const result = await sendMACommand('music/browse', { path });
      
      // Transform MA result to match our UI expectations
      const children = (result || []).map(item => ({
        media_content_id: item.uri || item.path,
        media_content_type: item.media_type || 'folder',
        title: item.name || item.sort_name || (item.translation_key ? item.translation_key.charAt(0).toUpperCase() + item.translation_key.slice(1) : 'Unknown'),
        media_class: item.media_type === 'folder' ? 'directory' : item.media_type,
        can_play: item.is_playable,
        can_expand: item.media_type === 'folder',
        thumbnail: item.image || item.metadata?.images?.[0]?.path || item.metadata?.images?.[0]?.url,
        provider: item.provider
      }));
      
      callback({ result: { children } });
    } catch (err) {
      console.error('MA Browse Error:', err.message);
      callback({ result: { children: [] } });
    }
  });

  socket.on('mass_search_media', async (payload, callback) => {
    try {
      const result = await sendMACommand('music/search', { search_query: payload.query, limit: 50 });
      // Search result usually has tracks, artists, albums arrays
      let children = [];
      if (result) {
        ['tracks', 'artists', 'albums', 'playlists'].forEach(type => {
          if (result[type]) {
            children.push(...result[type].map(item => ({
              media_content_id: item.uri,
              media_content_type: item.media_type || type.slice(0, -1),
              title: item.name,
              media_class: item.media_type === 'folder' ? 'directory' : (item.media_type || type.slice(0, -1)),
              can_play: true,
              can_expand: false,
              thumbnail: item.image || item.metadata?.images?.[0]?.path || item.metadata?.images?.[0]?.url,
              provider: item.provider
            })));
          }
        });
      }
      callback({ result: { children } });
    } catch (err) {
      console.error('MA Search Error:', err.message);
      callback({ result: { children: [] } });
    }
  });

  socket.on('mass_command', async (payload) => {
    try {
      if (payload.service === 'play_media') {
        await sendMACommand('player_queues/play_media', { 
          queue_id: payload.entityId, 
          media: payload.serviceData.media_content_id 
        });
      } else if (payload.service === 'media_pause') {
        await sendMACommand('player_queues/pause', { queue_id: payload.entityId });
      } else if (payload.service === 'media_play') {
        await sendMACommand('player_queues/play', { queue_id: payload.entityId });
      } else if (payload.service === 'media_next_track') {
        await sendMACommand('player_queues/next', { queue_id: payload.entityId });
      } else if (payload.service === 'media_previous_track') {
        await sendMACommand('player_queues/previous', { queue_id: payload.entityId });
      } else {
        // Fallback for volume, seek, etc. to Home Assistant
        callService('media_player', payload.service, {
          entity_id: payload.entityId,
          ...payload.serviceData
        });
      }
    } catch (err) {
      console.error('MA Command Error:', err.message);
    }
  });
}
