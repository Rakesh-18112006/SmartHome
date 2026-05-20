import { WebSocket } from 'ws';
const ws = new WebSocket('ws://192.168.0.101:8123/api/websocket');
let id = 1;

ws.on('open', () => {
  ws.send(JSON.stringify({ type: 'auth', access_token: process.env.HA_TOKEN }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  if (msg.type === 'auth_ok') {
    ws.send(JSON.stringify({
      id: id++,
      type: 'media_player/browse_media',
      entity_id: 'media_player.bharat_smart_services',
      media_content_type: 'music_assistant',
      media_content_id: 'tracks'
    }));
  } else if (msg.type === 'result') {
    console.log(JSON.stringify(msg.result.children.slice(0, 3), null, 2));
    process.exit(0);
  }
});
