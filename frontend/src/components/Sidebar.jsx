import React from 'react';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
    { id: 'scenes', icon: '🎬', label: 'Scenes' },
    { id: 'devices', icon: '📱', label: 'Devices' },
    { id: 'settings', icon: '⚙️', label: 'Settings' },
  ];

  return (
    <div className="sidebar">
      <div className="logo">
        <span className="logo-icon">✨</span>
        <span className="logo-text">SmartHome</span>
      </div>
      <nav>
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      
      <style jsx>{`
        .sidebar {
          width: 260px;
          height: 100vh;
          background: var(--bg-card);
          border-right: 1px solid var(--border);
          padding: 24px;
          display: flex;
          flex-direction: column;
          position: fixed;
          left: 0;
          top: 0;
        }
        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 40px;
          padding: 0 12px;
        }
        .logo-icon { font-size: 24px; }
        .logo-text {
          font-weight: 700;
          font-size: 20px;
          color: var(--text-main);
          letter-spacing: -0.5px;
        }
        nav { display: flex; flex-direction: column; gap: 8px; }
        .nav-item {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 16px;
          border-radius: var(--radius);
          background: transparent;
          color: var(--text-muted);
          font-weight: 500;
          text-align: left;
        }
        .nav-item:hover {
          background: var(--bg-main);
          color: var(--text-main);
        }
        .nav-item.active {
          background: var(--primary);
          color: white;
        }
        .nav-icon { font-size: 20px; }
      `}</style>
    </div>
  );
};

export default Sidebar;
