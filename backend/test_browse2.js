import { WebSocket } from 'ws';
const ws = new WebSocket('ws://192.168.0.139:8123/api/websocket');
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
      entity_id: 'media_player.googlehome7238'
    }));
  } else if (msg.type === 'result') {
    console.log(JSON.stringify(msg, null, 2).slice(0, 1000));
    process.exit(0);
  }
});
