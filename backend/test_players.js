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
      type: 'get_states'
    }));
  } else if (msg.type === 'result') {
    const players = msg.result.filter(e => e.entity_id.startsWith('media_player.'));
    console.log(players.map(p => ({
      entity_id: p.entity_id,
      attributes: p.attributes
    })));
    process.exit(0);
  }
});
