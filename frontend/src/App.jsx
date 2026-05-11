import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Sidebar from './components/Sidebar';
import DeviceCard from './components/DeviceCard';
import ColorControl from './components/ColorControl';
import Scenes from './components/Scenes';
import AddRoomModal from './components/AddRoomModal';
import ConfigureDeviceModal from './components/ConfigureDeviceModal';
import ProvisioningModal from './components/ProvisioningModal';





// Socket connection
const socket = io('http://localhost:3000', {
  path: '/socket.io/'
});

const App = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [lightStatus, setLightStatus] = useState(false);
  const [brightness, setBrightness] = useState(100);
  const [whiteIntensity, setWhiteIntensity] = useState(255);
  const [autoMode, setAutoMode] = useState(false);
  const [currentLux, setCurrentLux] = useState(0);
  const [mqttStatus, setMqttStatus] = useState('Connecting...');
  const [devices, setDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [configuringDevice, setConfiguringDevice] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);






  const isInteracting = useRef(false);

  useEffect(() => {
    fetchDevices();
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await fetch('http://localhost:3000/api/rooms');
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
    }
  };

  const fetchDevices = async () => {

    try {
      const res = await fetch('http://localhost:3000/api/devices');
      const data = await res.json();
      setDevices(data);
    } catch (err) {
      console.error('Failed to fetch devices', err);
    }
  };

  const handleAddRoom = async (roomData) => {
    try {
      const res = await fetch('http://localhost:3000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roomData)
      });
      if (res.ok) {
        fetchRooms();
      }
    } catch (err) {
      console.error('Failed to add room', err);
    }
  };

  const handleConfigureDevice = async (deviceId, configData) => {
    try {
      const res = await fetch(`http://localhost:3000/api/devices/${deviceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(configData)
      });
      if (res.ok) {
        fetchDevices();
        setConfiguringDevice(null);
      }
    } catch (err) {
      console.error('Failed to configure device', err);
    }
  };

  const handleRemoveDevice = async (deviceId) => {
    try {
      const res = await fetch(`http://localhost:3000/api/devices/${deviceId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchDevices();
      }
    } catch (err) {
      console.error('Failed to remove device', err);
    }
  };

  const handleRemoveRoom = async (roomName) => {
    if (!window.confirm(`Are you sure you want to remove the room "${roomName}"? Devices in this room will become Unassigned.`)) return;
    try {
      const res = await fetch(`http://localhost:3000/api/rooms/${roomName}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchRooms();
        fetchDevices();
        if (currentRoom?.name === roomName) setCurrentRoom(null);
      }
    } catch (err) {
      console.error('Failed to remove room', err);
    }
  };

  const handleAddDevice = async (deviceData) => {

    try {
      const res = await fetch('http://localhost:3000/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceData)
      });
      if (res.ok) {
        fetchDevices();
      }
    } catch (err) {
      console.error('Failed to provision device', err);
    }
  };


  useEffect(() => {

    socket.on('mqtt_status', (data) => setMqttStatus(data.status));
    
    // Global state sync from server
    socket.on('device_state_update', (state) => {
      if (!isInteracting.current) {
        setLightStatus(state.state === 'ON');
        setBrightness(state.brightness);
        setWhiteIntensity(state.color[3]);
        setAutoMode(state.autoMode);
        setCurrentLux(state.lastLux || 0);
      }
    });

    socket.on('mqtt_message', (data) => {
      if (data.topic.includes('status')) {
        try {
          const payload = JSON.parse(data.message);
          if (payload.lux !== undefined) setCurrentLux(payload.lux);
          
          if (!isInteracting.current) {
            setLightStatus(payload.state === 'ON');
            // If in auto mode, server handles brightness, so we just sync
            if (payload.brightness !== undefined) setBrightness(payload.brightness);
          }
        } catch (e) {
          console.error('Error parsing MQTT message', e);
        }
      }
    });

    return () => {
      socket.off('mqtt_status');
      socket.off('device_state_update');
      socket.off('mqtt_message');
    };
  }, []);

  const toggleLight = (val) => {
    setLightStatus(val);
    socket.emit('power_toggle', { state: val ? 'ON' : 'OFF' });
  };

  const handleBrightness = (val) => {
    if (autoMode) return;
    const value = parseInt(val);
    setBrightness(value);
    socket.emit('brightness_change', { brightness: value });
  };

  const handleColorChange = (color) => {
    socket.emit('color_change', { ...color, w: whiteIntensity });
  };

  const handleWhiteIntensity = (val) => {
    const value = parseInt(val);
    setWhiteIntensity(value);
    socket.emit('white_change', { white: value });
  };

  const toggleAutoMode = () => {
    const newMode = !autoMode;
    setAutoMode(newMode);
    socket.emit('toggle_auto_mode', { enabled: newMode });
  };

  const handlePureWhite = () => {
    socket.emit('force_white_mode');
  };

  // Render the detailed view for a light
  const renderDetailView = () => (
    <div className="detail-view animate-fade-in">
      <header className="detail-header">
        <button className="back-btn" onClick={() => setSelectedDevice(null)}>
          ← Back to Dashboard
        </button>
        <div className="title-row">
          <h1>{selectedDevice.title}</h1>
          <div className={`mode-badge ${autoMode ? 'auto' : ''}`}>
            {autoMode ? 'Auto Mode Active' : 'Manual Mode'}
          </div>
        </div>
      </header>

      <div className="detail-content">
        <div className="control-section main-controls">
          <div className="control-card">
            <div className="card-header-row">
              <h3>Power & Mode</h3>
              <div className={`status-dot ${lightStatus ? 'active' : ''}`}></div>
            </div>
            <div className="mode-controls">
              <div className="big-toggle">
                <span className={lightStatus ? 'on' : 'off'}>{lightStatus ? 'ON' : 'OFF'}</span>
                <button 
                  className={`power-btn ${lightStatus ? 'active' : ''}`}
                  onClick={() => toggleLight(!lightStatus)}
                >
                  ⏻
                </button>
              </div>
              <div className="auto-toggle-row">
                <div className="lux-info">
                  <span className="lux-icon">☀️</span>
                  <span className="lux-value">{currentLux} lx</span>
                </div>
                <button 
                  className={`auto-mode-btn ${autoMode ? 'active' : ''}`}
                  onClick={toggleAutoMode}
                >
                  {autoMode ? 'Disable Auto' : 'Enable Auto Mode'}
                </button>
              </div>
            </div>
            {autoMode && (
              <div className="auto-actions animate-fade-in">
                <button className="pure-white-btn" onClick={handlePureWhite}>
                  ✨ Pure White Mode
                </button>
              </div>
            )}
          </div>

          <div className={`control-card ${autoMode ? 'disabled' : ''}`}>
            <div className="card-header-row">
              <h3>Brightness</h3>
              {autoMode && <span className="disabled-label">Auto Managed</span>}
            </div>
            <div className="slider-container">
              <div className="value-display">{Math.round((brightness / 255) * 100)}%</div>
              <input 
                type="range" 
                min="0" 
                max="255" 
                value={brightness} 
                disabled={autoMode}
                onMouseDown={() => { isInteracting.current = true; }}
                onMouseUp={() => { isInteracting.current = false; }}
                onChange={(e) => handleBrightness(e.target.value)}
              />
            </div>
          </div>

          <div className="control-card">
            <h3>White Intensity</h3>
            <div className="slider-container">
              <div className="value-display">{Math.round((whiteIntensity / 255) * 100)}%</div>
              <input 
                type="range" 
                min="0" 
                max="255" 
                value={whiteIntensity} 
                onMouseDown={() => { isInteracting.current = true; }}
                onMouseUp={() => { isInteracting.current = false; }}
                onChange={(e) => handleWhiteIntensity(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="control-section color-controls">
          <div className="control-card color-picker-card">
            <h3>Color Palette</h3>
            <p className="subtitle">Atmosphere settings</p>
            <ColorControl onColorChange={handleColorChange} />
          </div>
        </div>
      </div>

      <style jsx>{`
        .detail-view { max-width: 1000px; margin: 0 auto; }
        .detail-header { margin-bottom: 40px; }
        .title-row { display: flex; align-items: center; justify-content: space-between; }
        .mode-badge { padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 700; background: #f1f5f9; color: var(--text-muted); }
        .mode-badge.auto { background: #dcfce7; color: #166534; }
        .back-btn { background: none; color: var(--primary); font-weight: 600; font-size: 14px; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
        .detail-header h1 { font-size: 32px; letter-spacing: -1px; margin-bottom: 4px; }
        
        .mode-controls { display: flex; flex-direction: column; gap: 24px; margin-top: 10px; }
        .auto-toggle-row { display: flex; align-items: center; justify-content: space-between; padding-top: 20px; border-top: 1px solid var(--border); }
        .lux-info { display: flex; align-items: center; gap: 8px; }
        .lux-value { font-weight: 700; color: var(--text-main); }
        
        .auto-mode-btn { padding: 10px 16px; border-radius: 12px; background: #f1f5f9; color: var(--text-main); font-weight: 600; font-size: 13px; }
        .auto-mode-btn.active { background: var(--accent-success); color: white; }
        
        .auto-actions { margin-top: 20px; }
        .pure-white-btn { width: 100%; padding: 12px; border-radius: 12px; background: white; border: 2px dashed var(--primary); color: var(--primary); font-weight: 700; transition: var(--transition); }
        .pure-white-btn:hover { background: var(--primary); color: white; border-style: solid; }

        .control-card.disabled { opacity: 0.6; position: relative; }
        .disabled-label { font-size: 11px; font-weight: 800; color: var(--primary); text-transform: uppercase; }

        .detail-content { display: grid; grid-template-columns: 1fr 1.5fr; gap: 32px; }
        .control-section { display: flex; flex-direction: column; gap: 32px; }
        .control-card { background: white; padding: 24px; border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); }
        .card-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; }
        .control-card h3 { font-size: 14px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; }
        .status-dot { width: 8px; height: 8px; border-radius: 50%; background: #cbd5e1; }
        .status-dot.active { background: var(--accent-success); box-shadow: 0 0 10px var(--accent-success); }

        .big-toggle { display: flex; justify-content: space-between; align-items: center; }
        .big-toggle span { font-size: 28px; font-weight: 800; letter-spacing: 1px; }
        .power-btn { width: 72px; height: 72px; border-radius: 50%; background: #f1f5f9; font-size: 28px; color: var(--text-muted); }
        .power-btn.active { background: var(--primary); color: white; box-shadow: 0 15px 25px -5px rgba(37, 99, 235, 0.4); }

        .slider-container { display: flex; flex-direction: column; gap: 12px; padding: 10px 0; }
        .value-display { font-size: 36px; font-weight: 800; color: var(--text-main); letter-spacing: -1px; }
        
        input[type="range"] { width: 100%; height: 10px; background: #e2e8f0; border-radius: 5px; outline: none; -webkit-appearance: none; }
        input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; width: 24px; height: 24px; background: white; border: 4px solid var(--primary); border-radius: 50%; cursor: pointer; }
        input[type="range"]:disabled::-webkit-slider-thumb { border-color: #cbd5e1; cursor: not-allowed; }

        @media (max-width: 768px) { .detail-content { grid-template-columns: 1fr; } }
      `}</style>
    </div>
  );

  const renderDashboard = () => (
    <div className="dashboard-view animate-fade-in">
      <div className="welcome-header">
        <h1>{currentRoom ? currentRoom.name : 'Your Home'}</h1>
        <p>{currentRoom ? `Managing devices in ${currentRoom.name}` : 'Select a room to manage your devices.'}</p>
        {currentRoom && (
          <button className="back-link" onClick={() => setCurrentRoom(null)}>
            ← Back to All Rooms
          </button>
        )}
      </div>

      {/* Newly Discovered Devices - Always show on main dashboard or if specifically in "Unassigned" */}
      {(!currentRoom || currentRoom.name === 'Unassigned') && devices.some(d => !d.isConfigured) && (
        <div className="discovery-section animate-fade-in">
          <div className="discovery-header">
            <div className="pulse-icon"></div>
            <h2>Newly Discovered Devices ({devices.filter(d => !d.isConfigured).length})</h2>
          </div>
          <div className="discovery-grid">
            {devices
              .filter(d => !d.isConfigured)
              .map(device => (
                <div key={device.deviceId} className="discovery-card" onClick={() => setConfiguringDevice(device)}>
                  <div className="discovery-icon">{device.icon}</div>
                  <div className="discovery-info">
                    <h4>{device.deviceId}</h4>
                    <p>Tap to assign appliance</p>
                  </div>
                  <button className="assign-btn">Assign</button>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {!currentRoom ? (
        <div className="rooms-grid">
          {rooms.map(room => {
            const roomDevices = devices.filter(d => d.room === room.name && d.isConfigured);
            const activeCount = roomDevices.filter(d => d.deviceId === 'light-1' ? lightStatus : d.on).length;
            
            return (
                <div key={room.name} className="room-card-wrapper">
                  <div className="room-card" onClick={() => setCurrentRoom(room)}>
                    <div className="room-card-header">
                      <span className="room-card-icon">{room.icon}</span>
                      <div className="room-card-stats">
                        <span className="active-dot"></span>
                        {activeCount} Active
                      </div>
                    </div>
                    <div className="room-card-body">
                      <h3>{room.name}</h3>
                      <p>{roomDevices.length} Devices</p>
                    </div>
                    <div className="room-card-footer">
                      <span>View Details</span>
                      <span className="arrow">→</span>
                    </div>
                  </div>
                  <button className="room-delete-btn" onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveRoom(room.name);
                  }}>×</button>
                </div>

            );
          })}
          
          {/* Unassigned Room Card if devices exist */}
          {devices.some(d => (!d.room || d.room === 'Unassigned') && d.isConfigured) && (
            <div className="room-card unassigned" onClick={() => setCurrentRoom({ name: 'Unassigned', icon: '❓' })}>
              <div className="room-card-header">
                <span className="room-card-icon">❓</span>
              </div>
              <div className="room-card-body">
                <h3>Unassigned</h3>
                <p>{devices.filter(d => (!d.room || d.room === 'Unassigned') && d.isConfigured).length} Devices</p>
              </div>
              <div className="room-card-footer">
                <span>View Details</span>
                <span className="arrow">→</span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="room-detail-view animate-fade-in">
          <div className="device-grid">
            {devices
              .filter(device => device.room === currentRoom.name && device.isConfigured)
              .map(device => (
                <DeviceCard 
                  key={device.deviceId}
                  title={device.title} 
                  status={device.deviceId === 'light-1' ? lightStatus : device.on}
                  icon={device.icon || "💡"}
                  type="none"
                  onToggle={device.deviceId === 'light-1' ? toggleLight : () => {}}
                  onAction={(action) => {
                    if (action === 'navigate') {
                      setSelectedDevice({ title: device.title, deviceId: device.deviceId });
                    } else if (action === 'remove') {
                      handleRemoveDevice(device.deviceId);
                    } else if (action === 'edit') {
                      setConfiguringDevice(device);
                    }
                  }}
                />

              ))
            }
          </div>
          {devices.filter(device => device.room === currentRoom.name && device.isConfigured).length === 0 && (
            <div className="empty-state">
              <p>No devices assigned to this room yet.</p>
            </div>
          )}
        </div>
      )}

      <div className="add-actions">
        <button className="add-device-btn" onClick={() => setIsModalOpen(true)}>
          <span>+</span> Add Device
        </button>
        {!currentRoom && (
          <button className="add-room-btn" onClick={() => setIsRoomModalOpen(true)}>
            <span>🏠</span> Add Room
          </button>
        )}
      </div>
    </div>


  );

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="content">
        <header className="top-bar">
          <div className="search-bar">
            <span>🔍</span>
            <input type="text" placeholder="Search devices..." />
          </div>
          <div className="status-chips">
            <span className={`chip ${mqttStatus === 'Connected' ? 'success' : 'warning'}`}>
              MQTT: {mqttStatus}
            </span>
            <span className="profile-chip">
              <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Rakesh" alt="Avatar" />
              <span>Rakesh M.</span>
            </span>
          </div>
        </header>
        {activeTab === 'scenes'
          ? <Scenes socket={socket} />
          : selectedDevice
            ? renderDetailView()
            : renderDashboard()
        }
        <ProvisioningModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onFinish={handleAddDevice} 
        />

        <AddRoomModal 
          isOpen={isRoomModalOpen} 
          onClose={() => setIsRoomModalOpen(false)} 
          onAdd={handleAddRoom} 
        />
        <ConfigureDeviceModal
          isOpen={!!configuringDevice}
          device={configuringDevice}
          onClose={() => setConfiguringDevice(null)}
          onConfigure={handleConfigureDevice}
        />
      </main>




      <style jsx>{`
        .app-container { display: flex; min-height: 100vh; }
        .content { margin-left: 260px; flex: 1; padding: 32px 48px; }
        .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        .search-bar { background: white; padding: 10px 20px; border-radius: 100px; border: 1px solid var(--border); display: flex; align-items: center; gap: 12px; width: 300px; }
        .search-bar input { border: none; outline: none; width: 100%; font-size: 14px; }
        .status-chips { display: flex; align-items: center; gap: 16px; }
        .chip { padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600; }
        .chip.success { background: #dcfce7; color: #166534; }
        .chip.warning { background: #fef9c3; color: #854d0e; }
        .profile-chip { display: flex; align-items: center; gap: 10px; padding: 4px 14px 4px 4px; background: white; border: 1px solid var(--border); border-radius: 100px; font-size: 13px; font-weight: 600; }
        .profile-chip img { width: 32px; height: 32px; border-radius: 50%; background: #f1f5f9; }
        .welcome-header h1 { font-size: 32px; letter-spacing: -1px; margin-bottom: 8px; }
        .welcome-header p { color: var(--text-muted); margin-bottom: 32px; }
        .quick-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 40px; }
        .stat-card { background: white; padding: 24px; border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); }
        .stat-card p { font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
        .stat-card h2 { font-size: 24px; font-weight: 700; }
        
        .discovery-section { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 24px; padding: 24px; margin-bottom: 40px; }
        .discovery-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .discovery-header h2 { font-size: 16px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; }
        .pulse-icon { width: 10px; height: 10px; background: var(--primary); border-radius: 50%; box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); } 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); } }
        
        .discovery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .discovery-card { background: white; padding: 16px; border-radius: 16px; display: flex; align-items: center; gap: 16px; cursor: pointer; transition: var(--transition); border: 1px solid var(--border); }
        .discovery-card:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: var(--shadow); }
        .discovery-icon { font-size: 24px; width: 48px; height: 48px; background: #f1f5f9; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .discovery-info h4 { font-size: 14px; font-weight: 700; color: var(--text-main); margin-bottom: 2px; }
        .discovery-info p { font-size: 12px; color: var(--text-muted); }
        .assign-btn { margin-left: auto; padding: 6px 14px; background: var(--primary); color: white; border-radius: 8px; font-size: 12px; font-weight: 700; }

        .section-title { margin: 32px 0 20px; }

        .section-title h2 { font-size: 18px; font-weight: 600; }
        .back-link { background: none; color: var(--primary); font-weight: 700; font-size: 14px; margin-top: 8px; display: block; }
        
        .rooms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 32px; margin-top: 20px; }
        .room-card-wrapper { position: relative; }
        .room-card { background: white; padding: 32px; border-radius: 28px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); cursor: pointer; transition: var(--transition); }
        .room-card:hover { transform: translateY(-6px); box-shadow: var(--shadow); border-color: var(--primary); }
        .room-delete-btn { 
          position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; 
          background: #fee2e2; color: #ef4444; border-radius: 50%; 
          display: flex; align-items: center; justify-content: center; 
          font-size: 18px; font-weight: 700; opacity: 0; transition: var(--transition);
        }
        .room-card-wrapper:hover .room-delete-btn { opacity: 1; }
        .room-delete-btn:hover { background: #ef4444; color: white; }
        
        .room-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }

        .room-card-icon { font-size: 32px; width: 64px; height: 64px; background: #f8fafc; border-radius: 16px; display: flex; align-items: center; justify-content: center; transition: var(--transition); }
        .room-card:hover .room-card-icon { background: var(--primary); transform: rotate(-5deg); color: white; }
        .room-card-stats { font-size: 12px; font-weight: 700; color: var(--text-muted); display: flex; align-items: center; gap: 6px; }
        .active-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--accent-success); }
        .room-card-body h3 { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
        .room-card-body p { font-size: 14px; color: var(--text-muted); }
        .room-card-footer { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; color: var(--primary); }
        .room-card-footer .arrow { transition: var(--transition); }
        .room-card:hover .arrow { transform: translateX(4px); }
        
        .room-detail-view { margin-top: 20px; }
        .device-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px; }
        
        .empty-state { text-align: center; padding: 60px; color: var(--text-muted); }
        
        .add-actions { display: flex; justify-content: center; gap: 20px; margin-top: 40px; }

        .add-device-btn { display: flex; align-items: center; gap: 10px; padding: 14px 28px; background: var(--primary); color: white; border-radius: 100px; font-weight: 700; box-shadow: 0 10px 20px rgba(37, 99, 235, 0.2); transition: var(--transition); }
        .add-device-btn:hover { transform: translateY(-2px); box-shadow: 0 15px 30px rgba(37, 99, 235, 0.3); }
        .add-device-btn span { font-size: 20px; }
        
        .add-room-btn { display: flex; align-items: center; gap: 10px; padding: 14px 28px; background: white; color: var(--primary); border: 1px solid var(--primary); border-radius: 100px; font-weight: 700; transition: var(--transition); }
        .add-room-btn:hover { background: rgba(37, 99, 235, 0.05); transform: translateY(-2px); }
        .add-room-btn span { font-size: 18px; }

        @media (max-width: 1024px) { .sidebar { width: 80px; padding: 24px 12px; } .logo-text, .nav-label { display: none; } .content { margin-left: 80px; padding: 24px; } .device-grid { grid-template-columns: 1fr 1fr; } }



      `}</style>
    </div>
  );
};

export default App;
