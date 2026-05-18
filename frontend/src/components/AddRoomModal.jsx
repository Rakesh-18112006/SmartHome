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
          background: rgba(64, 52, 42, 0.2);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
        }
        .modal-content {
          background: var(--bg-card);
          width: 90%;
          max-width: 400px;
          border-radius: var(--radius-lg);
          padding: 24px;
          box-shadow: var(--shadow-deep);
          border: 1px solid var(--border);
        }
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 20px;
        }
        .modal-header h2 { font-size: 18px; font-weight: 700; color: var(--text-main); letter-spacing: -0.3px; }
        .close-btn { font-size: 20px; background: none; color: var(--text-muted); cursor: pointer; transition: var(--transition); }
        .close-btn:hover { color: var(--text-main); transform: rotate(90deg); }
        
        .form-group { margin-bottom: 16px; }
        .form-group label { display: block; font-size: 11px; font-weight: 700; color: var(--text-muted); margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.5px; }
        .form-group input { width: 100%; padding: 10px 14px; border-radius: var(--radius-sm); border: 1px solid var(--border); outline: none; transition: var(--transition); background: var(--bg-main); font-size: 14px; font-weight: 500; color: var(--text-main); }
        .form-group input:focus { border-color: var(--primary); background: var(--bg-card); }
        
        .icon-selector { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
        .icon-btn { height: 44px; font-size: 20px; background: var(--bg-main); border: 1px solid transparent; border-radius: var(--radius-sm); transition: var(--transition); cursor: pointer; }
        .icon-btn:hover { background: var(--primary-glow); border-color: var(--primary-glow); }
        .icon-btn.active { background: var(--primary); border-color: var(--primary); box-shadow: 0 4px 12px var(--primary-glow); transform: scale(1.05); }
        
        .submit-btn { width: 100%; padding: 12px; background: var(--primary); color: white; border-radius: var(--radius-sm); font-weight: 700; margin-top: 8px; transition: var(--transition); box-shadow: 0 4px 12px var(--primary-glow); font-size: 14px; }
        .submit-btn:hover { transform: translateY(-2px); background: var(--primary-dark); }

        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
      `}</style>
    </div>
  );
};

export default AddRoomModal;
