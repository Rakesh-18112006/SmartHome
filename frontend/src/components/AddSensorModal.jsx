import React, { useState } from 'react';
import { X, Tag, Link, MapPin, Activity, Info } from 'lucide-react';

const AddSensorModal = ({ isOpen, onClose, onAdd, rooms }) => {
  const [formData, setFormData] = useState({
    name: '',
    topic: '',
    room: 'Unassigned',
    unit: ''
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onAdd(formData);
    setFormData({ name: '', topic: '', room: 'Unassigned', unit: '' });
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up glass" style={{ maxWidth: '500px', padding: '0', overflow: 'hidden' }}>
        <div className="modal-premium-header">
          <div className="header-bg-glow"></div>
          <div className="header-content-top">
            <div className="header-icon-circle">
              <Activity size={24} />
            </div>
            <button className="close-pill-btn" onClick={onClose}>
              <X size={18} />
            </button>
          </div>
          <div className="header-text-bottom">
            <h2>Add Custom Sensor</h2>
            <p>Register a new MQTT telemetry source</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="premium-form-body">
          <div className="form-section">
            <div className="input-field-wrapper">
              <label><Tag size={12} /> Sensor Identity</label>
              <div className="input-with-icon">
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Living Room Pressure"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                />
              </div>
            </div>

            <div className="input-field-wrapper">
              <label><Link size={12} /> MQTT Topic Path</label>
              <div className="input-with-icon">
                <input 
                  type="text" 
                  required
                  placeholder="smarthome/sensors/topic"
                  value={formData.topic}
                  onChange={(e) => setFormData({ ...formData, topic: e.target.value })}
                />
              </div>
            </div>

            <div className="form-grid-2">
              <div className="input-field-wrapper">
                <label><Info size={12} /> Unit</label>
                <input 
                  type="text" 
                  placeholder="kg, °C, %"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                />
              </div>
              <div className="input-field-wrapper">
                <label><MapPin size={12} /> Room Assignment</label>
                <select 
                  className="premium-select"
                  value={formData.room}
                  onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                >
                  <option value="Unassigned">Unassigned</option>
                  {(Array.isArray(rooms) ? rooms : []).map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="premium-modal-footer">
            <button type="button" className="action-btn-pill secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="action-btn-pill primary flex-grow">
              Register Sensor
            </button>
          </div>
        </form>

        <style jsx>{`
          .modal-premium-header {
            position: relative;
            padding: 40px 32px 32px;
            background: linear-gradient(135deg, var(--primary), #4f46e5);
            color: white;
            overflow: hidden;
          }
          .header-bg-glow {
            position: absolute;
            top: -50px;
            right: -50px;
            width: 200px;
            height: 200px;
            background: rgba(255, 255, 255, 0.15);
            filter: blur(40px);
            border-radius: 50%;
          }
          .header-content-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 24px;
            position: relative;
            z-index: 1;
          }
          .header-icon-circle {
            width: 54px;
            height: 54px;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
            border-radius: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 1px solid rgba(255, 255, 255, 0.3);
          }
          .close-pill-btn {
            background: rgba(0, 0, 0, 0.1);
            color: white;
            width: 32px;
            height: 32px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .header-text-bottom h2 {
            font-size: 24px;
            font-weight: 800;
            margin-bottom: 4px;
            letter-spacing: -0.5px;
          }
          .header-text-bottom p {
            font-size: 14px;
            opacity: 0.8;
            font-weight: 500;
          }
          .premium-form-body {
            padding: 32px;
            display: flex;
            flex-direction: column;
            gap: 24px;
          }
          .form-section {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }
          .input-field-wrapper {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
          .input-field-wrapper label {
            font-size: 11px;
            font-weight: 800;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 1px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .input-field-wrapper input, .premium-select {
            width: 100%;
            padding: 14px 18px;
            border-radius: 14px;
            border: 1.5px solid var(--border);
            background: var(--bg-main);
            color: var(--text-main);
            font-size: 15px;
            font-weight: 600;
            transition: var(--transition);
          }
          .input-field-wrapper input:focus, .premium-select:focus {
            border-color: var(--primary);
            background: white;
            box-shadow: 0 0 0 4px var(--primary-glow);
          }
          .form-grid-2 {
            display: grid;
            grid-template-columns: 1fr 1.5fr;
            gap: 16px;
          }
          .premium-modal-footer {
            display: flex;
            gap: 12px;
            margin-top: 8px;
          }
          .flex-grow { flex: 1; }
          
          [data-theme="dark"] .input-field-wrapper input:focus, 
          [data-theme="dark"] .premium-select:focus {
            background: rgba(255, 255, 255, 0.05);
          }
        `}</style>
      </div>
    </div>
  );
};

export default AddSensorModal;
