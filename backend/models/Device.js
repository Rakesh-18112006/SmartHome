import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
  },
  title: {
    type: String,
    required: true,
  },
  type: {
    type: String,
    default: 'light',
  },
  icon: {
    type: String,
    default: '💡',
  },
  room: {
    type: String,
    default: 'Unassigned',
  },
  isConfigured: {
    type: Boolean,
    default: false,
  },
  on: {
    type: Boolean,
    default: false,
  },
  brightness: {
    type: Number,
    default: 100,
    min: 0,
    max: 100,
  },
  spectrumRgb: {
    type: Number,
    default: 16777215, 
  },
  effect: {
    type: String,
    default: 'solid',
  },
});

const Device = mongoose.model('Device', deviceSchema);

export default Device;
