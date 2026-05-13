import Device from '../models/Device.js';
import Sensor from '../models/Sensor.js';

const deviceCache = new Map();
const sensorTopicCache = new Map();
const missingSensorTopics = new Map();
const MISSING_SENSOR_TTL_MS = 60 * 1000;

export const getDevice = async (deviceId) => {
  let device = deviceCache.get(deviceId);
  if (!device) {
    device = await Device.findOne({ deviceId }).lean();
    if (device) deviceCache.set(deviceId, device);
  }
  return device;
};

export const updateDeviceCache = (deviceId, device) => {
  deviceCache.set(deviceId, typeof device.toObject === 'function' ? device.toObject() : device);
};

export const clearDeviceCache = (deviceId) => {
  deviceCache.delete(deviceId);
};

export const clearAllDeviceCache = () => {
  deviceCache.clear();
};

export const getFullCache = () => deviceCache;

export const getSensorByTopic = async (topic) => {
  const cached = sensorTopicCache.get(topic);
  if (cached) return cached;

  const missingAt = missingSensorTopics.get(topic);
  if (missingAt && Date.now() - missingAt < MISSING_SENSOR_TTL_MS) {
    return null;
  }

  const sensor = await Sensor.findOne({ topic });
  if (sensor) {
    sensorTopicCache.set(topic, sensor);
    missingSensorTopics.delete(topic);
    return sensor;
  }

  missingSensorTopics.set(topic, Date.now());
  return null;
};

export const updateSensorTopicCache = (topic, sensor) => {
  sensorTopicCache.set(topic, sensor);
  missingSensorTopics.delete(topic);
};

export const clearSensorTopicCache = (topic) => {
  sensorTopicCache.delete(topic);
  missingSensorTopics.delete(topic);
};
