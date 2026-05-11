import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema({
  deviceId: {
    type: String,
    required: true,
    unique: true,
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
