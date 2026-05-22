import WebSocket from 'ws';

const MA_URL = process.env.MASS_URL || 'ws://192.168.0.139:8095/ws';
const TOKEN = process.env.MASS_TOKEN || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJIbkxSQ3ktUHF6WG9mWV9zZE9KWXRZamtNWHpXSEZwSTlXblBNdzJXamcwIiwianRpIjoiRHFRQ0dFcUZWbU0yV0N3ak9JLTBmc3RaN09iM1R5N2J6WEwyelVVQ2tVOCIsImlhdCI6MTc3OTQyOTMxNywiZXhwIjoyMDk0Nzg5MzE3LCJ1c2VybmFtZSI6ImNvcmFsaW5ub3ZhdGlvbnMiLCJyb2xlIjoiYWRtaW4iLCJ0b2tlbl9uYW1lIjoiU21hcnRIb21lIiwiaXNfbG9uZ19saXZlZCI6dHJ1ZX0.iPGhvH2428kjFDhoXaEm2agbkhtof167kGz1Aps10kM';

const ws = new WebSocket(MA_URL);
let msgId = 1;

ws.on('open', () => {
  ws.send(JSON.stringify({
    message_id: String(msgId++),
    command: "auth",
    args: { token: TOKEN }
  }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  
  if (msg.result?.authenticated) {
    ws.send(JSON.stringify({
      message_id: String(msgId++),
      command: "get_commands" // maybe this?
    }));
    ws.send(JSON.stringify({
      message_id: String(msgId++),
      command: "core/get_commands"
    }));
    ws.send(JSON.stringify({
      message_id: String(msgId++),
      command: "core/commands"
    }));
    ws.send(JSON.stringify({
      message_id: String(msgId++),
      command: "music/get_library_tracks"
    }));
  }
  
  if (msg.message_id === "2") console.log("2:", msg);
  if (msg.message_id === "3") console.log("3:", msg);
  if (msg.message_id === "4") console.log("4:", msg);
  if (msg.message_id === "5") {
    console.log("5:", msg);
    process.exit(0);
  }
});
