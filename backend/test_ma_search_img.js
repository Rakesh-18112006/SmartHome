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
      command: "music/search",
      args: { search_query: "neeli", limit: 5 }
    }));
  }
  
  if (msg.message_id === "2" && msg.result) {
    const tracks = msg.result.tracks || [];
    tracks.forEach(t => {
      console.log(t.name);
      console.log('image:', t.image);
      console.log('metadata.images:', JSON.stringify(t.metadata?.images, null, 2));
    });
    process.exit(0);
  }
});
