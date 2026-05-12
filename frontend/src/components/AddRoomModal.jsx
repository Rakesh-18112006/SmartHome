import React, { useState } from 'react';

const AddRoomModal = ({ isOpen, onClose, onAdd }) => {
  const [formData, setFormData] = useState({
    name: '',
    icon: '🏠'
  });

  if (!isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!formData.name) return;
    onAdd(formData);
    onClose();
  };

  const icons = ['🏠', '🛋️', '🛏️', '🍳', '🛁', '🏢', '🌳', '🚗', '🎮', '💡'];

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up">
        <div className="modal-header">
          <h2>Create New Room</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Room Name</label>
            <input 
              type="text" 
              placeholder="e.g. Balcony, Study Room"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Room Icon</label>
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
          <button type="submit" className="submit-btn">Create Room</button>
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
          max-width: 400px;
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
        
        .icon-selector { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
        .icon-btn { height: 44px; font-size: 20px; background: var(--bg-secondary); border: 1px solid var(--border); border-radius: 12px; transition: var(--transition); }
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

export default AddRoomModal;
