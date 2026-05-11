import React from 'react';

const DeviceCard = ({ title, status, icon, type, value, onToggle, onAction }) => {
  return (
    <div 
      className={`device-card ${status ? 'on' : 'off'}`}
      onClick={(e) => {
        // Only trigger if not clicking the toggle labels or checkbox
        if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
          onAction('navigate');
        }
      }}
    >
      <div className="card-header">
        <div className="icon-box">{icon}</div>
        <div className="card-actions">
          <button 
            className="action-btn edit-btn" 
            onClick={(e) => {
              e.stopPropagation();
              onAction('edit');
            }}
          >
            ✏️
          </button>
          <button 
            className="action-btn delete-btn" 
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`Are you sure you want to remove ${title}?`)) {
                onAction('remove');
              }
            }}
          >
            🗑️
          </button>
        </div>
      </div>

      <div className="card-body">
        <h3>{title}</h3>
        <p>{status ? 'Active' : 'Offline'}</p>
      </div>
      {status && type === 'slider' && (
        <div className="card-footer">
          <input 
            type="range" 
            min="0" 
            max="100" 
            value={value} 
            onChange={(e) => onAction(e.target.value)}
          />
          <span>{value}%</span>
        </div>
      )}

      <style jsx>{`
        .device-card {
          background: var(--bg-card);
          border: 1px solid var(--border);
          padding: 20px;
          border-radius: var(--radius);
          box-shadow: var(--shadow-sm);
          transition: var(--transition);
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .device-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow);
        }
        .device-card.on {
          border-color: var(--primary);
          background: linear-gradient(145deg, #ffffff 0%, #f0f7ff 100%);
        }
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .icon-box {
          width: 44px;
          height: 44px;
          background: var(--bg-main);
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          transition: var(--transition);
        }
        .on .icon-box {
          background: var(--primary);
          color: white;
        }
        .card-actions {
          display: flex;
          gap: 4px;
        }
        .action-btn {
          background: none;
          font-size: 14px;
          opacity: 0;
          transition: var(--transition);
          padding: 8px;
          border-radius: 8px;
        }
        .device-card:hover .action-btn {
          opacity: 0.5;
        }
        .action-btn:hover {
          opacity: 1 !important;
          background: #f1f5f9;
        }
        .delete-btn:hover {
          background: #fee2e2 !important;
        }
        .card-body h3 {
          font-size: 16px;
          font-weight: 600;
          margin-bottom: 4px;
        }
        .card-body p {
          font-size: 13px;
          color: var(--text-muted);
        }
        .card-footer {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-top: 8px;
        }
        .card-footer input { flex: 1; }
        .card-footer span { font-size: 12px; font-weight: 600; min-width: 32px; }

        /* Toggle Switch */
        .toggle-box input { display: none; }
        .toggle-box label {
          display: block;
          width: 44px;
          height: 24px;
          background: #cbd5e1;
          border-radius: 12px;
          position: relative;
          cursor: pointer;
          transition: var(--transition);
        }
        .toggle-box label:after {
          content: '';
          position: absolute;
          width: 18px;
          height: 18px;
          background: white;
          border-radius: 50%;
          top: 3px;
          left: 3px;
          transition: var(--transition);
        }
        .toggle-box input:checked + label { background: var(--primary); }
        .toggle-box input:checked + label:after { left: 23px; }
      `}</style>
    </div>
  );
};

export default DeviceCard;
