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

// Initialize Backend Services
const startServer = async () => {
  // 1. Connect MongoDB
  await connectDB();

  // 2. Seed Default Device if needed
  const existing = await Device.findOne({ deviceId: 'light-1' });
  if (!existing) {
    await Device.create({ deviceId: 'light-1', on: false, brightness: 100 });
    console.log('🌱 Seeded default device: light-1');
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
