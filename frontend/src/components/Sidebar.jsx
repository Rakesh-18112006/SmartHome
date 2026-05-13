import React from 'react';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const menuItems = [
    { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
    { id: 'scenes', icon: '🎬', label: 'Scenes' },
    { id: 'sensors', icon: '📡', label: 'Sensors' },
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
    </div>
  );
};

export default Sidebar;
