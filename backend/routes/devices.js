import express from 'express';
import Device from '../models/Device.js';

const router = express.Router();

// Get all devices
router.get('/', async (req, res) => {
  try {
    const devices = await Device.find();
    
    // Add isOnline property based on lastSeen (heartbeat)
    const now = new Date();
    const heartbeatThreshold = 45 * 1000; // 45 seconds
    
    const enhancedDevices = devices.map(device => {
      const devObj = device.toObject();
      const lastSeen = devObj.lastSeen ? new Date(devObj.lastSeen) : null;
      devObj.isOnline = lastSeen && (now - lastSeen) < heartbeatThreshold;
      return devObj;
    });

    res.json(enhancedDevices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new device
router.post('/', async (req, res) => {
  const { deviceId, title, type, icon, room, subDevices } = req.body;
  const device = new Device({
    deviceId,
    title,
    type,
    icon,
    room,
    subDevices,
    on: false,
    brightness: 100,
    isConfigured: true
  });

  try {
    const newDevice = await device.save();
    res.status(201).json(newDevice);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Update/Configure a device
router.put('/:deviceId', async (req, res) => {
  const { title, type, icon, room, subDevices } = req.body;
  try {
    const updatedDevice = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      { title, type, icon, room, subDevices, isConfigured: true },
      { new: true }
    );
    res.json(updatedDevice);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Remove a device
router.delete('/:deviceId', async (req, res) => {
  try {
    await Device.findOneAndDelete({ deviceId: req.params.deviceId });
    res.json({ message: 'Device removed successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
