import React, { useState } from 'react';


const Sidebar = ({ activeTab, setActiveTab, isMobileOpen, onMobileClose }) => {
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { id: 'dashboard', icon: <img src="/icons/icons/Home-White.svg" alt="Dashboard" style={{width: 20, height: 20}} />, label: 'Dashboard' },
    { id: 'scenes', icon: <img src="/icons/devices/scenes.svg" alt="Scenes" style={{width: 22, height: 22, objectFit: 'contain'}} />, label: 'Scenes' },
    { id: 'sensors', icon: <img src="/icons/devices/sensor.svg" alt="Sensors" style={{width: 22, height: 22, objectFit: 'contain'}} />, label: 'Sensors' },
    { id: 'devices', icon: <img src="/icons/icons/Plug-White.svg" alt="Devices" style={{width: 20, height: 20}} />, label: 'Devices' },
    { id: 'audio-devices', icon: <img src="/icons/devices/audio.png" alt="Audio" style={{width: 20, height: 20, objectFit: 'contain', filter: 'invert(1) brightness(2)'}} />, label: 'Audio' },
    { id: 'staircase', icon: <img src="/icons/devices/staircase.png" alt="Staircase" style={{width: 20, height: 20, objectFit: 'contain', filter: 'invert(1) brightness(2)'}} />, label: 'Staircase' },
    { id: 'settings', icon: <img src="/icons/icons/Settings-White.svg" alt="Settings" style={{width: 20, height: 20}} />, label: 'Settings' },
  ];

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''} ${isMobileOpen ? 'mobile-open' : ''}`}>
      <div className="sidebar-header">
        <div className="logo">
          <span className="logo-icon">⚡</span>
          <span className="logo-text">SmartHome</span>
        </div>
        <button
          className="sidebar-toggle"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <img src={collapsed ? "/icons/icons/Right-White.svg" : "/icons/icons/Left-White.svg"} alt="Toggle" style={{width: 18, height: 18}} />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(item.id); if (onMobileClose) onMobileClose(); }}
            title={collapsed ? item.label : ''}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="mt-auto pt-4 border-t border-slate-700/50">
        <button
          className="nav-item text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors w-full"
          onClick={() => {
            localStorage.removeItem('smarthome_token');
            window.location.replace('/login');
          }}
          title={collapsed ? 'Logout' : ''}
        >
          <span className="nav-icon"><img src="/icons/icons/Logout-White.svg" alt="Logout" style={{width: 20, height: 20}} /></span>
          <span className="nav-label">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;

