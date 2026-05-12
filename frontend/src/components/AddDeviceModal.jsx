import React, { useState, useEffect } from 'react';


const AddDeviceModal = ({ isOpen, onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    title: '',
    deviceId: '',
    type: 'light',
    icon: '💡',
    room: 'Unassigned'
  });
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    const fetchRooms = async () => {
      try {
        const res = await fetch('http://localhost:3000/api/rooms');
        const data = await res.json();
        setRooms(data);
        if (data.length > 0) setFormData(prev => ({ ...prev, room: data[0].name }));
      } catch (err) {
        console.error('Failed to fetch rooms', err);
      }
    };
    fetchRooms();
  }, []);


  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.title || !formData.deviceId) return;
    onAdd(formData);
    onClose();
  };

  const icons = ['💡', '🔌', '📊', '🔘', '🌈', '🔆', '🪟', '❄️', '📺', '📹', '🔊', '🌡️', '🔒'];

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up">
        <div className="modal-header">
          <h2>Add New Device</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Device Name</label>
            <input 
              type="text" 
              placeholder="e.g. Kitchen Light"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Device ID (Unique)</label>
            <input 
              type="text" 
              placeholder="e.g. light-kitchen"
              value={formData.deviceId}
              onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Room</label>
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
            <label>Icon</label>

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
          <button type="submit" className="submit-btn">Add Device</button>
        </form>
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0, 0, 0, 0.4);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: var(--bg-card);
          width: 90%;
          max-width: 450px;
          border-radius: 24px;
          padding: 32px;
          box-shadow: 0 20px 40px rgba(0, 0, 0, 0.2);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }
        .modal-header h2 { font-size: 20px; font-weight: 700; }
        .close-btn { font-size: 24px; background: none; color: var(--text-muted); }
        
        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; }
        .form-group input { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); outline: none; transition: var(--transition); }
        .form-group input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.1); }
        
        .room-select { width: 100%; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); outline: none; background: var(--bg-card); cursor: pointer; }
        
        .icon-selector { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }

        .icon-btn { height: 48px; font-size: 20px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; transition: var(--transition); }
        .icon-btn:hover { background: #f1f5f9; }
        .icon-btn.active { background: var(--primary); color: white; border-color: var(--primary); }
        
        .submit-btn { width: 100%; padding: 14px; background: var(--primary); color: white; border-radius: 12px; font-weight: 700; margin-top: 10px; box-shadow: 0 10px 15px -3px rgba(37, 99, 235, 0.3); }
        .submit-btn:hover { transform: translateY(-2px); }

        .animate-slide-up { animation: slideUp 0.3s ease-out; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default AddDeviceModal;
