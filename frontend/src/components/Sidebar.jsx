import React, { useState } from 'react';
import { LayoutDashboard, Layers, Radio, Cpu, Settings, PanelLeftClose, PanelLeftOpen, AlignEndHorizontal, LogOut } from 'lucide-react';

const Sidebar = ({ activeTab, setActiveTab }) => {
  const [collapsed, setCollapsed] = useState(false);

  const menuItems = [
    { id: 'dashboard', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { id: 'scenes', icon: <Layers size={20} />, label: 'Scenes' },
    { id: 'sensors', icon: <Radio size={20} />, label: 'Sensors' },
    { id: 'devices', icon: <Cpu size={20} />, label: 'Devices' },
    { id: 'staircase', icon: <AlignEndHorizontal size={20} />, label: 'Staircase' },
    { id: 'settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  return (
    <div className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
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
          {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto">
        {menuItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
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
            window.location.href = '/login';
          }}
          title={collapsed ? 'Logout' : ''}
        >
          <span className="nav-icon"><LogOut size={20} /></span>
          <span className="nav-label">Logout</span>
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
