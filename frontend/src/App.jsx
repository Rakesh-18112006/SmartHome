import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import Sidebar from './components/Sidebar';
import DeviceCard from './components/DeviceCard';
import ColorControl from './components/ColorControl';
import Scenes from './components/Scenes';

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

  const isInteracting = useRef(false);

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
        <h1>Smart Home</h1>
        <p>Welcome back, Rakesh. System is stable.</p>
      </div>

      <div className="quick-stats">
        <div className="stat-card">
          <p>Avg Temp</p>
          <h2>24°C</h2>
        </div>
        <div className="stat-card">
          <p>Light Intensity</p>
          <h2>{currentLux} lx</h2>
        </div>
        <div className="stat-card">
          <p>Active Mode</p>
          <h2>{autoMode ? 'Auto' : 'Manual'}</h2>
        </div>
      </div>

      <div className="section-title">
        <h2>Your Devices</h2>
      </div>

      <div className="device-grid">
        <DeviceCard 
          title="Living Room Light" 
          status={lightStatus}
          icon="💡"
          type="none"
          onToggle={toggleLight}
          onAction={(action) => action === 'navigate' && setSelectedDevice({ title: 'Living Room Light' })}
        />
        <DeviceCard title="Air Conditioner" status={false} icon="❄️" />
        <DeviceCard title="Smart TV" status={false} icon="📺" />
        <DeviceCard title="Main Camera" status={true} icon="📹" />
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
        .section-title { margin: 32px 0 20px; }
        .section-title h2 { font-size: 18px; font-weight: 600; }
        .device-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 24px; }
        @media (max-width: 1024px) { .sidebar { width: 80px; padding: 24px 12px; } .logo-text, .nav-label { display: none; } .content { margin-left: 80px; padding: 24px; } .device-grid { grid-template-columns: 1fr 1fr; } }
      `}</style>
    </div>
  );
};

export default App;
