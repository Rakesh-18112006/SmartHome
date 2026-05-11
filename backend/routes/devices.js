import express from 'express';
import Device from '../models/Device.js';

const router = express.Router();

// Get all devices
router.get('/', async (req, res) => {
  try {
    const devices = await Device.find();
    res.json(devices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new device
router.post('/', async (req, res) => {
  const { deviceId, title, type, icon } = req.body;
  const device = new Device({
    deviceId,
    title, // I should add title to the model
    type,
    icon,
    on: false,
    brightness: 100,
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
  const { title, type, icon, room } = req.body;
  try {
    const updatedDevice = await Device.findOneAndUpdate(
      { deviceId: req.params.deviceId },
      { title, type, icon, room, isConfigured: true },
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
