import express from 'express';
import Room from '../models/Room.js';
import Device from '../models/Device.js';
import { clearAllDeviceCache } from '../services/cacheService.js';

const router = express.Router();


// Get all rooms
router.get('/', async (req, res) => {
  try {
    const rooms = await Room.find().lean();
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new room
router.post('/', async (req, res) => {
  const { name, icon } = req.body;
  const room = new Room({ name, icon });

  try {
    const newRoom = await room.save();
    res.status(201).json(newRoom);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Remove a room
router.delete('/:name', async (req, res) => {
  try {
    const roomName = req.params.name;
    await Room.findOneAndDelete({ name: roomName });
    // Update devices that were in this room
    await Device.updateMany({ room: roomName }, { room: 'Unassigned' });
    clearAllDeviceCache();
    res.json({ message: 'Room removed successfully' });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
