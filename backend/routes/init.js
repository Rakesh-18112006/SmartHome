import express from 'express';
import Device from '../models/Device.js';
import Room from '../models/Room.js';
import Sensor from '../models/Sensor.js';

const router = express.Router();

/**
 * Combined initialization endpoint.
 * Fetches all critical data in a single round-trip to reduce latency.
 */
router.get('/init', async (req, res) => {
  try {
    const [devices, rooms, sensors] = await Promise.all([
      Device.find().lean(),
      Room.find().lean(),
      Sensor.find().lean()
    ]);

    // Enhance devices with isOnline status
    const now = new Date();
    const heartbeatThreshold = 45 * 1000;
    const enhancedDevices = devices.map(device => {
      const devObj = { ...device };
      const lastSeen = devObj.lastSeen ? new Date(devObj.lastSeen) : null;
      devObj.isOnline = lastSeen && (now - lastSeen) < heartbeatThreshold;
      return devObj;
    });

    res.json({
      devices: enhancedDevices,
      rooms: rooms,
      sensors: sensors
    });
  } catch (err) {
    console.error('[API INIT] Error:', err);
    res.status(500).json({ message: 'Failed to initialize application data' });
  }
});

export default router;
