import React from 'react';

const DeviceCard = ({ title, status, on, icon, type, value, timerRemaining, onToggle, onAction }) => {
  return (
    <div 
      className={`device-card ${status ? 'online' : 'offline'}`}
      onClick={(e) => {
        // Only trigger if not clicking the toggle labels or checkbox
        if (e.target.tagName !== 'LABEL' && e.target.tagName !== 'INPUT') {
          onAction('navigate');
        }
      }}
    >
      <div className="card-header">
        <div className={`icon-box ${on ? 'power-on' : 'power-off'}`}>{icon}</div>
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
        {timerRemaining > 0 && (
          <div className="timer-badge" title="Timer Active">
            ⏱️ {Math.ceil(timerRemaining / 60)}m
          </div>
        )}
      </div>

      <div className="card-body">
        <div className="device-info">
          <h3>{title}</h3>
          <div className={`connectivity-status ${status ? 'online' : 'offline'}`}>
            <span className="dot"></span>
            {status ? 'Online' : 'Offline'}
          </div>
        </div>
        <div className="power-indicator">
          <span className={`power-tag ${on ? 'active' : 'inactive'}`}>
            {on ? 'ON' : 'OFF'}
          </span>
        </div>
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
        .device-card.online {
          border-color: var(--primary);
        }
        .device-card.offline {
          opacity: 0.8;
          border-color: var(--border);
          background: var(--bg-secondary);
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
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 20px;
          transition: var(--transition);
          border: 1px solid var(--border);
        }
        .icon-box.power-on {
          background: linear-gradient(135deg, var(--primary), #3b82f6);
          color: white;
          border-color: transparent;
          box-shadow: 0 4px 10px rgba(37, 99, 235, 0.3);
        }
        .icon-box.power-off {
          background: var(--bg-tertiary);
          color: var(--text-muted);
        }
        
        .card-body {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-top: 4px;
        }
        .device-info h3 {
          font-size: 16px;
          font-weight: 700;
          margin-bottom: 2px;
          color: var(--text-main);
        }
        .connectivity-status {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 11px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }
        .connectivity-status.online { color: #16a34a; }
        .connectivity-status.offline { color: #94a3b8; }
        .connectivity-status .dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
        }
        .connectivity-status.online .dot { background: #22c55e; box-shadow: 0 0 8px #22c55e; }
        .connectivity-status.offline .dot { background: #94a3b8; }

        .power-tag {
          font-size: 10px;
          font-weight: 800;
          padding: 2px 8px;
          border-radius: 6px;
        }
        .power-tag.active { background: #dcfce7; color: #166534; }
        .power-tag.inactive { background: #f1f5f9; color: #475569; }
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
          background: var(--border);
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
          background: var(--bg-card);
          border-radius: 50%;
          top: 3px;
          left: 3px;
          transition: var(--transition);
        }
        .toggle-box input:checked + label { background: var(--primary); }
        .toggle-box input:checked + label:after { left: 23px; }

        .timer-badge {
          background: #fef3c7;
          color: #92400e;
          font-size: 10px;
          font-weight: 800;
          padding: 4px 8px;
          border-radius: 100px;
          display: flex;
          align-items: center;
          gap: 4px;
          border: 1px solid #fcd34d;
        }
      `}</style>
    </div>
  );
};

export default DeviceCard;
