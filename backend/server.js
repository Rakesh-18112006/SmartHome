import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import connectDB from './config/db.js';
import { connectMQTT } from './config/mqtt.js';
import { initSocket } from './services/socketService.js';
import smarthomeRoutes from './routes/smarthome.js';
import automationRoutes from './routes/automations.js';
import Device from './models/Device.js';
import devicesRoutes from './routes/devices.js';
import Room from './models/Room.js';
import roomsRoutes from './routes/rooms.js';



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

// Routes
app.use('/', smarthomeRoutes);
app.use('/api/automations', automationRoutes);
app.use('/api/devices', devicesRoutes);
app.use('/api/rooms', roomsRoutes);



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

  // 3. Seed Default Devices if needed
  const defaultDevices = [
    { 
      deviceId: 'light-1', 
      title: 'Living Room Light',
      type: 'light',
      icon: '💡',
      on: false, 
      brightness: 100 
    },
    {
      deviceId: 'plug-1',
      title: 'Smart Plug',
      type: 'plug',
      icon: '🔌',
      on: false
    },
    {
      deviceId: 'auditor-1',
      title: 'Bijli Auditor',
      type: 'sensor',
      icon: '📊',
      on: true
    },
    {
      deviceId: 'switch-1',
      title: 'Smart Switch',
      type: 'switch',
      icon: '🔘',
      on: false
    },
    {
      deviceId: 'rgbw-1',
      title: 'RGBW Strip',
      type: 'light',
      icon: '🌈',
      on: false
    },
    {
      deviceId: 'tunable-1',
      title: 'Tunable Panel',
      type: 'light',
      icon: '🔆',
      on: false
    },
    {
      deviceId: 'curtain-1',
      title: 'Master Curtain',
      type: 'curtain',
      icon: '🪟',
      room: 'Bedroom',
      on: true
    }
  ];

  for (const dev of defaultDevices) {
    const existing = await Device.findOne({ deviceId: dev.deviceId });
    if (!existing) {
      // Assign some rooms by default
      if (dev.deviceId === 'light-1') dev.room = 'Living Room';
      if (dev.deviceId === 'plug-1') dev.room = 'Kitchen';
      if (dev.deviceId === 'auditor-1') dev.room = 'Living Room';
      if (dev.deviceId === 'switch-1') dev.room = 'Bedroom';
      if (dev.deviceId === 'rgbw-1') dev.room = 'Living Room';
      if (dev.deviceId === 'tunable-1') dev.room = 'Kitchen';
      
      dev.isConfigured = true;
      await Device.create(dev);
      console.log(`🌱 Seeded default device: ${dev.deviceId}`);
    }
  }

  // Seed some "Discovered" but unconfigured devices
  const discoveredDevices = [
    { deviceId: 'esp-99a2', title: 'New ESP8266', isConfigured: false, icon: '🔌' },
    { deviceId: 'esp-44b1', title: 'Discovered Device', isConfigured: false, icon: '💡' }
  ];

  for (const dev of discoveredDevices) {
    const existing = await Device.findOne({ deviceId: dev.deviceId });
    if (!existing) {
      await Device.create(dev);
      console.log(`🔍 Discovered new device: ${dev.deviceId}`);
    }
  }



  // 3. Connect MQTT
  const mqttClient = connectMQTT(io);

  // 4. Initialize Socket.io
  initSocket(io, mqttClient);

  // 5. Start Listening
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Smart Home Server running on port ${PORT}`);
  });
};

startServer();
