import express from 'express';
import Sensor from '../models/Sensor.js';
import { getMqttClient } from '../services/mqttManager.js';

const router = express.Router();

// Get all sensors
router.get('/', async (req, res) => {
  try {
    const sensors = await Sensor.find();
    res.json(sensors);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Add a new sensor
router.post('/', async (req, res) => {
  const { name, topic, room, unit } = req.body;
  const sensor = new Sensor({ name, topic, room, unit });

  try {
    const newSensor = await sensor.save();
    
    // Subscribe to the new MQTT topic
    const mqttClient = getMqttClient();
    if (mqttClient && mqttClient.connected) {
      mqttClient.subscribe(topic, (err) => {
        if (!err) {
          console.log(`📡 Dynamically subscribed to sensor topic: ${topic}`);
        }
      });
    }

    res.status(201).json(newSensor);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Delete a sensor
router.delete('/:id', async (req, res) => {
  try {
    const sensor = await Sensor.findById(req.params.id);
    if (!sensor) return res.status(404).json({ message: 'Sensor not found' });

    // Unsubscribe from MQTT topic
    const mqttClient = getMqttClient();
    if (mqttClient && mqttClient.connected) {
      mqttClient.unsubscribe(sensor.topic);
    }

    await Sensor.findByIdAndDelete(req.params.id);
    res.json({ message: 'Sensor deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
