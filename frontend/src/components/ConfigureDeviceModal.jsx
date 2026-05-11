import React, { useState, useEffect } from 'react';

const ConfigureDeviceModal = ({ isOpen, onClose, onConfigure, device }) => {
  const [formData, setFormData] = useState({
    title: '',
    type: 'light',
    icon: '💡',
    room: 'Unassigned'
  });
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (device) {
      setFormData({
        title: device.title || '',
        type: device.type || 'light',
        icon: device.icon || '💡',
        room: device.room || 'Unassigned'
      });
    }
  }, [device]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/rooms');
        const data = await res.json();
        setRooms(data);
      } catch (err) {
        console.error('Failed to fetch rooms', err);
      }
    };
    fetchRooms();
  }, []);

  if (!isOpen || !device) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onConfigure(device.deviceId, formData);
    onClose();
  };

  const icons = ['💡', '🔌', '📊', '🔘', '🌈', '🔆', '🪟', '❄️', '📺', '📹', '🔊', '🌡️', '🔒'];

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up">
        <div className="modal-header">
          <h2>Configure Device</h2>
          <p className="subtitle">ID: {device.deviceId}</p>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Appliance Name</label>
            <input 
              type="text" 
              placeholder="e.g. Master Bedroom Fan"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Assign to Room</label>
            <select 
              value={formData.room}
              onChange={(e) => setFormData({ ...formData, room: e.target.value })}
              className="room-select"
            >
              <option value="Unassigned">Unassigned</option>
              {rooms.map(room => (
                <option key={room.name} value={room.name}>{room.name}</option>
              ))}
            </select>
          </div>
          <div className="form-group">
            <label>Select Appliance Type Icon</label>
            <div className="icon-selector">
              {icons.map(icon => (
                <button
                  key={icon}
                  type="button"
                  className={`icon-btn ${formData.icon === icon ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, icon })}
                >
                  {icon}
                </button>
              ))}
            </div>
          </div>
          <button type="submit" className="submit-btn">Complete Setup</button>
        </form>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; z-index: 1000;
        }
        .modal-content {
          background: white; width: 90%; max-width: 450px; border-radius: 24px; padding: 32px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }
        .modal-header { margin-bottom: 24px; position: relative; }
        .modal-header h2 { font-size: 20px; font-weight: 700; }
        .subtitle { font-size: 12px; color: var(--text-muted); font-family: monospace; }
        .close-btn { position: absolute; top: -10px; right: -10px; font-size: 24px; background: none; color: var(--text-muted); }
        
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; }
        .form-group input, .room-select { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); outline: none; }
        
        .icon-selector { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
        .icon-btn { height: 44px; font-size: 20px; background: #f8fafc; border: 1px solid var(--border); border-radius: 12px; }
        .icon-btn.active { background: var(--primary); color: white; }
        
        .submit-btn { width: 100%; padding: 14px; background: var(--primary); color: white; border-radius: 12px; font-weight: 700; margin-top: 10px; }

        .animate-slide-up { animation: slideUp 0.3s ease-out; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default ConfigureDeviceModal;
