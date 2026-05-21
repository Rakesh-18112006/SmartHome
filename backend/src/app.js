import express from 'express';
import dns from 'node:dns';

// Fix for ENOTFOUND errors on some Windows systems with Node.js 18+
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './infrastructure/mongodb/db.js';
import { connectMQTT } from './integrations/mqtt/mqtt.js';
import { initSocket } from './core/websocket/socketService.js';
import { startScheduler } from './modules/automations/schedulerService.js';
import smarthomeRoutes from './modules/homes/smarthome.routes.js';
import automationRoutes from './modules/automations/automations.routes.js';
import Device from './modules/devices/Device.js';
import devicesRoutes from './modules/devices/devices.routes.js';
import Room from './modules/rooms/Room.js';
import roomsRoutes from './modules/rooms/rooms.routes.js';
import googleSmartHomeRoutes from './integrations/google/googleSmartHome.routes.js';
import sensorsRoutes from './modules/sensors/sensors.routes.js';
import Sensor from './modules/sensors/Sensor.js';
import { connectHomeAssistant } from './integrations/homeassistant/ha-client.js';


dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  path: '/socket.io/'
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health Check
// app.get('/', (req, res) => {
//   res.status(200).json({ 
//     status: 'online', 
//     message: 'Smart Home Backend is running',
//     timestamp: new Date().toISOString()
//   });
// });

// Routes
app.use('/', smarthomeRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/rooms', roomsRoutes);
app.use('/google', googleSmartHomeRoutes);
app.use('/api/sensors', sensorsRoutes);

// Image proxy for Home Assistant authenticated media
app.get('/api/ha/image', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).send('Missing url');
    
    let targetUrl = url;
    if (url.startsWith('/')) {
      let baseUrl = 'http://192.168.0.139:8123';
      if (process.env.HA_URL) {
        baseUrl = process.env.HA_URL.replace('ws://', 'http://').replace('wss://', 'https://').split('/api/websocket')[0];
      }
      targetUrl = `${baseUrl}${url}`;
    }
    
    const response = await fetch(targetUrl, {
      headers: { 'Authorization': `Bearer ${process.env.HA_TOKEN}` }
    });
    
    if (!response.ok) return res.status(response.status).send('HA returned error');
    
    res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    res.send(buffer);
  } catch (e) {
    console.error('Image proxy error:', e);
    res.status(500).send('Proxy error');
  }
});

import { cachedHaStates } from './integrations/homeassistant/ha-client.js';
app.get('/api/debug/media', (req, res) => {
  const players = Array.from(cachedHaStates.values()).filter(e => e.type === 'media_player');
  res.json(players);
});

// Initialize Backend Services
const startServer = async () => {
  // 1. Connect MongoDB
  await connectDB();

  // 2. Seed Default Rooms if needed
  const defaultRooms = [
    { name: 'Living Room', icon: '🛋️' },
    { name: 'Bedroom', icon: '🛏️' },
    { name: 'Kitchen', icon: '🍳' }
  ];

  for (const r of defaultRooms) {
    const existing = await Room.findOne({ name: r.name });
    if (!existing) {
      await Room.create(r);
      console.log(`🌱 Seeded default room: ${r.name}`);
    }
  }

  // 3. Connect MQTT
  const mqttClient = connectMQTT(io);

  // 4. Initialize Socket.io
  initSocket(io, mqttClient);

  // 5. Start Scheduler
  startScheduler(io);

 
  // 6. Subscribe to Custom Sensors
  try {
    const sensors = await Sensor.find();
    const topics = sensors.map(s => s.topic);
    if (topics.length > 0) {
      mqttClient.subscribe(topics, () => {
        console.log(`📡 Resubscribed to ${topics.length} custom sensor topics`);
      });
    }
  } catch (err) {
    console.error('Failed to resubscribe to custom sensors:', err);
  }

  // 7. Start Home Assistant Client
  connectHomeAssistant(io);

  // 8. Start Listening
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Smart Home Server running on port ${PORT}`);
  });
};

startServer();
