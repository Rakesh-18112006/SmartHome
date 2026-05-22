import WebSocket from 'ws';
import fs from 'fs';

const MA_URL = 'ws://192.168.0.139:8095/ws';
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJIbkxSQ3ktUHF6WG9mWV9zZE9KWXRZamtNWHpXSEZwSTlXblBNdzJXamcwIiwianRpIjoiRHFRQ0dFcUZWbU0yV0N3ak9JLTBmc3RaN09iM1R5N2J6WEwyelVVQ2tVOCIsImlhdCI6MTc3OTQyOTMxNywiZXhwIjoyMDk0Nzg5MzE3LCJ1c2VybmFtZSI6ImNvcmFsaW5ub3ZhdGlvbnMiLCJyb2xlIjoiYWRtaW4iLCJ0b2tlbl9uYW1lIjoiU21hcnRIb21lIiwiaXNfbG9uZ19saXZlZCI6dHJ1ZX0.iPGhvH2428kjFDhoXaEm2agbkhtof167kGz1Aps10kM';

const ws = new WebSocket(MA_URL);
let msgId = 1;

function sendCommand(command, args = {}) {
  const payload = {
    message_id: msgId++,
    command: command,
    args: args
  };
  ws.send(JSON.stringify(payload));
}

ws.on('open', () => {
  ws.send(JSON.stringify({
    message_id: msgId++,
    command: "auth",
    args: { token: TOKEN }
  }));
});

let dump = {};

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.message_id === "1" && msg.result?.authenticated) {
    sendCommand('player_queues/play_media', { queue_id: 'up2472055ad504', media: 'ytmusic--wgRaom8t://track/1' });
    sendCommand('players/set_volume', { player_id: 'up2472055ad504', volume_level: 20 });
    sendCommand('players/volume_set', { player_id: 'up2472055ad504', volume_level: 20 });
    sendCommand('player/set_volume', { player_id: 'up2472055ad504', volume_level: 20 });
  }
  
  if (msg.message_id) {
    dump[msg.message_id] = msg;
    if (Object.keys(dump).length === 5) {
      fs.writeFileSync('ma_dump5.json', JSON.stringify(dump, null, 2));
      console.log('Saved to ma_dump5.json');
      ws.close();
      process.exit(0);
    }
  }
});

setTimeout(() => {
  console.log('Timeout. Exiting...');
  ws.close();
  process.exit(0);
}, 5000);
