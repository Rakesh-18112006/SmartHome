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
