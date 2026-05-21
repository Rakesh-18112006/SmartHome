import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Power, Search, LayoutDashboard, Settings, Plus, Activity, Thermometer, Moon, Sun, Radio, Droplets, Footprints, Wind } from 'lucide-react';
import Sidebar from './components/Sidebar';
import DeviceCard from './components/DeviceCard';
import ColorControl from './components/ColorControl';
import Scenes from './components/Scenes';
import AddRoomModal from './components/AddRoomModal';
import ConfigureDeviceModal from './components/ConfigureDeviceModal';
import ProvisioningModal from './components/ProvisioningModal';
import SensorCard from './components/SensorCard';
import AddSensorModal from './components/AddSensorModal';
import MusicDeck from './components/MusicDeck';
import Staircase from './components/Staircase';

// Dynamic API Base URL for network access
const API_BASE = `http://${window.location.hostname}:3000`;

// Socket connection
const socket = io(API_BASE, {
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
  const [mqttStatus, setMqttStatus] = useState('Syncing...');
  const [devices, setDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [isSensorModalOpen, setIsSensorModalOpen] = useState(false);
  const [configuringDevice, setConfiguringDevice] = useState(null);
  const [sensors, setSensors] = useState([]);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [timerInfo, setTimerInfo] = useState({ remaining: 0, action: null });
  const [metrics, setMetrics] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState(null);
  const [curtainMoving, setCurtainMoving] = useState(null);
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = localStorage.getItem('theme');
    return saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkMode ? 'dark' : 'light');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  useEffect(() => {
    if (selectedDevice) {
      const updated = devices.find(d => d.deviceId === selectedDevice.deviceId);
      if (updated) setSelectedDevice(updated);
    }
  }, [devices]);

  const filteredDevices = devices.filter(d =>
    d.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.deviceId?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.room?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };

  const handleMediaCommand = (entityId, service, serviceData = {}) => {
    socket.emit('ha_command', {
      domain: 'media_player',
      service: service,
      entityId: entityId,
      serviceData: serviceData
    });
  };

  const isInteracting = useRef(false);
  const sensorsRef = useRef(sensors);

  useEffect(() => {
    sensorsRef.current = sensors;
  }, [sensors]);

  useEffect(() => {
    fetchDevices();
    fetchRooms();
    fetchSensors();
  }, []);

  const fetchDevices = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/devices`);
      const data = await res.json();
      // Preserve Home Assistant devices since they are only stored in memory via sockets
      setDevices(prev => {
        const haDevices = (Array.isArray(prev) ? prev : []).filter(d => d.isHomeAssistant);
        return [...(Array.isArray(data) ? data : []), ...haDevices];
      });
    } catch (err) {
      console.error('Failed to fetch devices', err);
    }
  };

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`);
      const data = await res.json();
      setRooms(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
      setRooms([]);
    }
  };

  const fetchSensors = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sensors`);
      const data = await res.json();
      setSensors(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch sensors', err);
      setSensors([]);
    }
  };

  const handleAddSensor = async (sensorData) => {
    try {
      const res = await fetch(`${API_BASE}/api/sensors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sensorData)
      });
      if (res.ok) fetchSensors();
    } catch (err) {
      console.error('Failed to add sensor', err);
    }
  };

  const handleRemoveSensor = async (id) => {
    if (!window.confirm('Remove this sensor?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/sensors/${id}`, { method: 'DELETE' });
      if (res.ok) fetchSensors();
    } catch (err) {
      console.error('Failed to remove sensor', err);
    }
  };

  const handleAddRoom = async (roomData) => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`, {
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
      const res = await fetch(`${API_BASE}/api/devices/${deviceId}`, {
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
      const res = await fetch(`${API_BASE}/api/devices/${deviceId}`, {
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
      const res = await fetch(`${API_BASE}/api/rooms/${roomName}`, {
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
      const res = await fetch(`${API_BASE}/api/devices`, {
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
    fetchDevices();
    fetchRooms();
    fetchSensors();

    // REMOVED 5-second polling loop which caused massive UI lag and slider jumping.
    // We now rely entirely on the fast WebSocket events for real-time updates!
    
    socket.on('mqtt_status', (data) => setMqttStatus(data.status));
    
    socket.on('device_state_update', (updatedDevice) => {
      setDevices(prev => (Array.isArray(prev) ? prev : []).map(d => d.deviceId === updatedDevice.deviceId ? { ...updatedDevice, isOnline: true } : d));
    });

    socket.on('custom_sensor_update', (updatedSensor) => {
      setSensors(prev => (Array.isArray(prev) ? prev : []).map(s => s._id === updatedSensor._id ? updatedSensor : s));
    });

    socket.on('toast_message', (msg) => {
      showToast(msg);
    });

    // Handle incoming Home Assistant normalized entities
    socket.on('ha_entity_state_change', (haDevice) => {
      setDevices(prev => {
        const list = Array.isArray(prev) ? prev : [];
        
        const haName = (haDevice.name || '').toLowerCase();
        const isLocalDevice = list.some(d => !d.isHomeAssistant && (d.title || '').toLowerCase() === haName);
        const isLocalSensor = sensorsRef.current.some(s => (s.name || '').toLowerCase() === haName);
        const isSelfPublished = haDevice.entity_id.includes('ha_switch') || haDevice.entity_id.includes('ha_light') || haDevice.entity_id.includes('ha_sensor') || haDevice.entity_id.includes('ha_fan') || haDevice.entity_id.includes('ha_rgbw');

        if (isLocalDevice || isLocalSensor || isSelfPublished) {
          return list;
        }

        const existingIndex = list.findIndex(d => d.deviceId === haDevice.entity_id);
        
        // Map HA entity to standard device format expected by UI
        const mappedDevice = {
          deviceId: haDevice.entity_id,
          title: haDevice.name,
          type: haDevice.type === 'switch' ? 'plug' : haDevice.type, // UI expects plug/light/rgbw/curtain
          room: haDevice.room || 'Unassigned', // Dynamically map HA Room
          isOnline: haDevice.state !== 'unavailable' && haDevice.state !== 'unknown',
          on: haDevice.on,
          // HA mapper provides brightness 0-100, UI internal state expects 0-255
          brightness: haDevice.brightness !== undefined ? Math.round((haDevice.brightness / 100) * 255) : 255,
          icon: haDevice.type === 'light' ? '💡' : (haDevice.type === 'media_player' ? '🎵' : '🔌'),
          isConfigured: true,
          isHomeAssistant: true,
          mediaState: haDevice.state,
          mediaTitle: haDevice.mediaTitle,
          mediaArtist: haDevice.mediaArtist,
          mediaAlbum: haDevice.mediaAlbum,
          albumArt: haDevice.albumArt,
          volume: haDevice.volume,
          deviceClass: haDevice.deviceClass,
          isMusicAssistant: haDevice.isMusicAssistant,
          mediaPosition: haDevice.mediaPosition,
          mediaDuration: haDevice.mediaDuration,
          mediaPositionUpdatedAt: haDevice.mediaPositionUpdatedAt
        };

        if (existingIndex >= 0) {
          // Update existing
          const updated = [...list];
          updated[existingIndex] = { ...updated[existingIndex], ...mappedDevice };
          return updated;
        } else {
          // Add new HA device to the dashboard
          return [...list, mappedDevice];
        }
      });
    });

    return () => {
      socket.off('mqtt_status');
      socket.off('device_state_update');
      socket.off('custom_sensor_update');
      socket.off('toast_message');
      socket.off('ha_entity_state_change');
    };
  }, []);

  // Update selected device info when devices list changes
  useEffect(() => {
    if (selectedDevice) {
      const updated = devices.find(d => d.deviceId === selectedDevice.deviceId);
      if (updated && !isInteracting.current) {
        setLightStatus(updated.on);
        setBrightness(updated.brightness);
        setAutoMode(updated.effect === 'auto');
        setCurrentLux(updated.lastLux || 0);
        setTimerInfo({
          remaining: updated.timerRemaining || 0,
          action: updated.timerAction
        });
        setMetrics({
          voltage: updated.voltage,
          current: updated.current,
          power: updated.power,
          energy: updated.energy,
          pf: updated.pf,
          temp: updated.temperature
        });
      }
    }
  }, [devices, selectedDevice]);

  const toggleLight = (val) => {
    setLightStatus(val);
    if (selectedDevice) {
      if (selectedDevice.isHomeAssistant) {
        socket.emit('ha_command', {
          domain: selectedDevice.type === 'plug' ? 'switch' : selectedDevice.type,
          service: val ? 'turn_on' : 'turn_off',
          entityId: selectedDevice.deviceId
        });
        return;
      }
      const isPlug = selectedDevice.type === 'plug' || selectedDevice.type === 'switch';
      const payload = isPlug
        ? { entityId: selectedDevice.deviceId, relayStatus: val ? 'ON' : 'OFF' }
        : { deviceId: selectedDevice.deviceId, state: val ? 'ON' : 'OFF' };
      socket.emit('power_toggle', payload);
    }
  };

  const handleSetTimer = (minutes, action) => {
    if (selectedDevice) {
      if (minutes === "0") {
        showToast("🚫 Timer disabled");
      } else {
        showToast(`⏱️ Timer started: ${minutes} min countdown`);
      }
      socket.emit('set_offline_timer', {
        deviceId: selectedDevice.deviceId,
        timer: minutes,
        action: action
      });
    }
  };

  const handleAddSchedule = (startTime, endTime, days, startAction = 'ON', endAction = 'OFF') => {
    if (selectedDevice) {
      socket.emit('add_schedule', { deviceId: selectedDevice.deviceId, startTime, endTime, days, startAction, endAction });
      showToast(`📅 Schedule added`);
    }
  };

  const handleRemoveSchedule = (scheduleId) => {
    if (selectedDevice) {
      socket.emit('remove_schedule', { deviceId: selectedDevice.deviceId, scheduleId });
      showToast("🗑️ Schedule removed");
    }
  };

  const handleCurtainAction = (action) => {
    if (selectedDevice) {
      socket.emit('curtain_action', { deviceId: selectedDevice.deviceId, action });
    }
  };

  const lastEmitTime = useRef(0);
  const interactionTimeout = useRef(null);

  const throttleEmit = (event, data) => {
    // Set interacting flag to prevent inbound state from overriding UI
    isInteracting.current = true;
    
    // Clear existing timeout and set a new one to reset interaction flag
    if (interactionTimeout.current) clearTimeout(interactionTimeout.current);
    interactionTimeout.current = setTimeout(() => {
      isInteracting.current = false;
    }, 1500); // Wait 1.5s after last move before syncing back from server

    const now = Date.now();
    if (now - lastEmitTime.current > 100) {
      socket.emit(event, data);
      lastEmitTime.current = now;
    }
  };

  const handleBrightness = (val) => {
    const value = parseInt(val);
    setBrightness(value);
    if (selectedDevice) {
      if (selectedDevice.isHomeAssistant && selectedDevice.type === 'light') {
        throttleEmit('ha_command', {
          domain: 'light',
          service: 'turn_on',
          entityId: selectedDevice.deviceId,
          serviceData: { brightness: Math.round((value / 255) * 100) } // HA brightness pct
        });
        return;
      }
      throttleEmit('brightness_change', { deviceId: selectedDevice.deviceId, brightness: value });
    }
  };

  const handleColorChange = (color) => {
    if (selectedDevice) {
      if (selectedDevice.isHomeAssistant && selectedDevice.type === 'light') {
        throttleEmit('ha_command', {
          domain: 'light',
          service: 'turn_on',
          entityId: selectedDevice.deviceId,
          serviceData: { rgb_color: [color.r, color.g, color.b] }
        });
        return;
      }
      throttleEmit('color_change', { deviceId: selectedDevice.deviceId, ...color, w: whiteIntensity });
    }
  };

  const handleWhiteIntensity = (val) => {
    const value = parseInt(val);
    setWhiteIntensity(value);
    if (selectedDevice) {
      if (selectedDevice.isHomeAssistant && selectedDevice.type === 'light') {
        throttleEmit('ha_command', {
          domain: 'light',
          service: 'turn_on',
          entityId: selectedDevice.deviceId,
          serviceData: { color_temp_kelvin: value * 20 } // Rough mapping
        });
        return;
      }
      throttleEmit('white_change', { deviceId: selectedDevice.deviceId, white: value });
    }
  };

  const toggleAutoMode = () => {
    const newMode = !autoMode;
    setAutoMode(newMode);
    if (selectedDevice) {
      socket.emit('toggle_auto_mode', { deviceId: selectedDevice.deviceId, enabled: newMode });
    }
  };

  const handlePureWhite = () => {
    if (selectedDevice) {
      socket.emit('force_white_mode', { deviceId: selectedDevice.deviceId });
    }
  };

  const renderDetailView = () => {
    if (!selectedDevice) return null;

    const isLight = selectedDevice.type === 'light' || selectedDevice.type === 'rgbw';
    const isTouchPanel = selectedDevice.type === 'touch-panel' || selectedDevice.deviceId.startsWith('BSQ');
    const isPlug = selectedDevice.type === 'plug' || selectedDevice.type === 'switch' || selectedDevice.deviceId.startsWith('BSP');
    const isEnergyMonitor = selectedDevice.deviceId.startsWith('B1E') || selectedDevice.deviceId.startsWith('B3E') || selectedDevice.deviceId.startsWith('BSP');
    const isThreePhase = selectedDevice.deviceId.startsWith('B3E');
    const isSinglePhase = selectedDevice.deviceId.startsWith('B1E');

    const renderEnergyMetrics = () => {
      if (isThreePhase) {
        return (
          <div className="control-card glass three-phase-card">
            <h3>Three-Phase Monitoring (R-Y-B)</h3>
            <div className="phase-grid">
              {['R', 'Y', 'B'].map(phase => (
                <div key={phase} className={`phase-column ${phase.toLowerCase()}`}>
                  <div className="phase-label">{phase} Phase</div>
                  <div className="phase-stat">
                    <label>Voltage</label>
                    <span>{selectedDevice[`voltage${phase}`] || 0}V</span>
                  </div>
                  <div className="phase-stat">
                    <label>Current</label>
                    <span>{selectedDevice[`current${phase}`] || 0}A</span>
                  </div>
                  <div className="phase-stat">
                    <label>Power</label>
                    <span>{selectedDevice[`power${phase}`] || 0}W</span>
                  </div>
                  <div className="phase-stat">
                    <label>PF</label>
                    <span>{selectedDevice[`pf${phase}`] || 0}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="energy-total-row">
              <div className="total-item single">
                <label>Total Active Energy Consumption</label>
                <span>{selectedDevice.energy || 0} kWh</span>
              </div>
            </div>
          </div>
        );
      }

      if (isSinglePhase) {
        return (
          <div className="control-card glass bijli-auditor-card">
            <h3>Bijli Auditor (Single Phase)</h3>
            <div className="auditor-hero">
              <div className="hero-metric">
                <span className="val">{selectedDevice.power || 0}</span>
                <label>Active Power (W)</label>
              </div>
              <div className="hero-divider"></div>
              <div className="hero-metric">
                <span className="val">{selectedDevice.energy || 0}</span>
                <label>Total kWh</label>
              </div>
            </div>
            <div className="auditor-grid">
              <div className="audit-stat"><span>{selectedDevice.voltage || 0}V</span><label>Voltage</label></div>
              <div className="audit-stat"><span>{selectedDevice.current || 0}A</span><label>Current</label></div>
              <div className="audit-stat"><span>{selectedDevice.pf || 0}</span><label>Power Factor</label></div>
              <div className="audit-stat"><span>{selectedDevice.phaseAngle || 0}°</span><label>Phase Angle</label></div>
              <div className="audit-stat"><span>{selectedDevice.apparentPowerR || 0}VA</span><label>Apparent</label></div>
              <div className="audit-stat"><span>{selectedDevice.reactivePowerR || 0}VAr</span><label>Reactive</label></div>
            </div>
          </div>
        );
      }

      // Default Plug/Switch Energy Monitor
      return (
        <div className="control-card glass energy-card">
          <h3>Energy Monitoring</h3>
          <div className="energy-main-val">
            <Activity size={20} />
            <span>{selectedDevice.power || 0} W</span>
          </div>
          <div className="energy-grid-mini">
            <div className="e-stat"><span>{selectedDevice.voltage || 0}V</span><label>Voltage</label></div>
            <div className="e-stat"><span>{selectedDevice.current || 0}A</span><label>Current</label></div>
            <div className="e-stat"><span>{selectedDevice.energy || 0}</span><label>kWh</label></div>
            {selectedDevice.temperature !== undefined && (
              <div className="e-stat"><span>{selectedDevice.temperature}°C</span><label>Internal Temp</label></div>
            )}
          </div>
        </div>
      );
    };

    const isCurtain = selectedDevice.type === 'curtain';

    return (
      <div className="detail-view animate-slide-up">
        <header className="detail-header">
          <button className="back-btn glass" onClick={() => setSelectedDevice(null)}>
            <LayoutDashboard size={18} /> Back
          </button>
          <div className="title-row">
            <div className="title-left">
              <span className="device-icon-large">{selectedDevice.icon}</span>
              <div className="device-meta">
                <h1>{selectedDevice.title}</h1>
                <span className="device-id">{selectedDevice.deviceId} • {selectedDevice.room}</span>
              </div>
              <button className="edit-settings-btn" onClick={() => setConfiguringDevice(selectedDevice)}>
                <Settings size={18} />
              </button>
            </div>
            <div className={`status-pill ${selectedDevice.isOnline ? 'active' : ''}`}>
              {selectedDevice.isOnline ? 'Online' : 'Offline'}
            </div>
          </div>
        </header>

        <div className="detail-content">
          {/* Only Plugs (BSP) get the side panel for Timer/Schedule. Monitors use full width for their grids. */}
          <div className={`detail-main-grid ${isPlug ? 'has-side' : ''}`}>
            {/* Primary Controls */}
            <div className="control-section-group">
              {/* If it's a pure monitor, show metrics in the main column */}
              {(isThreePhase || isSinglePhase) && renderEnergyMetrics()}

              {/* Specialized Header for Lights with Power/Auto toggle */}
              {isLight && (
                <div className="control-card glass light-main-controls">
                  <div className="compact-power-header">
                    <div className="power-label-group">
                      <h3>Main Controls</h3>
                      <p className="status-subtext">{lightStatus ? 'Device is active' : 'Device is standby'}</p>
                    </div>
                    <div className="header-actions">
                      {selectedDevice.type === 'light' && (
                        <div className="auto-pill">
                          <Sun size={14} />
                          <span>{currentLux} lx</span>
                          <button
                            className={`mini-toggle ${autoMode ? 'active' : ''}`}
                            onClick={toggleAutoMode}
                          >
                            {autoMode ? 'Auto' : 'Manual'}
                          </button>
                        </div>
                      )}
                      <button
                        className={`power-pill-btn ${lightStatus ? 'active' : ''}`}
                        onClick={() => toggleLight(!lightStatus)}
                      >
                        <Power size={18} />
                        {lightStatus ? 'ON' : 'OFF'}
                      </button>
                    </div>
                  </div>

                  <div className={`light-adjustments ${autoMode ? 'disabled' : ''}`}>
                    <div className="adjustment-row">
                      <div className="row-head">
                        <label>Brightness</label>
                        <span className="percent">{Math.round((brightness / 255) * 100)}%</span>
                      </div>
                      <div className="slider-wrapper">
                        <input
                          type="range" min="0" max="255" value={brightness}
                          disabled={autoMode}
                          onChange={(e) => handleBrightness(e.target.value)}
                        />
                      </div>
                    </div>

                    {selectedDevice.type === 'rgbw' && (
                      <>
                        <div className="adjustment-row">
                          <div className="row-head">
                            <label>White Light</label>
                            <span className="percent">{Math.round((whiteIntensity / 255) * 100)}%</span>
                          </div>
                          <div className="slider-wrapper">
                            <input
                              type="range" min="0" max="255" value={whiteIntensity}
                              disabled={autoMode}
                              onChange={(e) => handleWhiteIntensity(e.target.value)}
                            />
                          </div>
                        </div>
                        <div className="color-section">
                          <label>Color Palette</label>
                          <ColorControl onColorChange={handleColorChange} />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Keep large power button ONLY for Plugs/Switches */}
              {isPlug && (
                <div className="control-card glass">
                  <div className="card-header-row">
                    <h3>Power Control</h3>
                    <div className={`status-dot ${lightStatus ? 'active' : ''}`}></div>
                  </div>
                  <div className="power-interface">
                    <button
                      className={`master-power-btn ${lightStatus ? 'active' : ''}`}
                      onClick={() => toggleLight(!lightStatus)}
                    >
                      <Power size={48} />
                      <span>{lightStatus ? 'TAP TO TURN OFF' : 'TAP TO TURN ON'}</span>
                    </button>
                  </div>
                </div>
              )}

              {isCurtain && (
                <div className="control-card glass">
                  <h3>Curtain Controls</h3>
                  <div className="curtain-actions press-hold-mode">
                    <div className="curtain-action-pair">
                      <label>Manual Operation</label>
                      <button
                        className={`curtain-btn ${curtainMoving === 'opening' ? 'active' : ''}`}
                        onMouseDown={() => { handleCurtainAction(11); setCurtainMoving('opening'); }}
                        onMouseUp={() => { handleCurtainAction(10); setCurtainMoving(null); }}
                        onTouchStart={() => { handleCurtainAction(11); setCurtainMoving('opening'); }}
                        onTouchEnd={() => { handleCurtainAction(10); setCurtainMoving(null); }}
                      >
                        {curtainMoving === 'opening' ? 'OPENING...' : 'OPEN'}
                      </button>
                    </div>
                    <div className="curtain-action-pair">
                      <button
                        className={`curtain-btn ${curtainMoving === 'closing' ? 'active' : ''}`}
                        onMouseDown={() => { handleCurtainAction(21); setCurtainMoving('closing'); }}
                        onMouseUp={() => { handleCurtainAction(20); setCurtainMoving(null); }}
                        onTouchStart={() => { handleCurtainAction(21); setCurtainMoving('closing'); }}
                        onTouchEnd={() => { handleCurtainAction(20); setCurtainMoving(null); }}
                      >
                        {curtainMoving === 'closing' ? 'CLOSING...' : 'CLOSE'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {isTouchPanel && (
                <div className="control-card glass full-width">
                  <div className="card-header-row">
                    <h3>Multi-Switch Panel</h3>
                    <button className="master-off-btn" onClick={() => socket.emit('touch_panel_all_off', { deviceId: selectedDevice.deviceId })}>All OFF</button>
                  </div>
                  <div className="touch-grid-detail">
                    {(selectedDevice.subDevices || []).map((sd) => (
                      <div key={sd.index} className={`touch-detail-item ${sd.on ? 'active' : ''}`}>
                        <div className="item-head">
                          <span className="icon">{sd.type === 'fan' ? '🌀' : '💡'}</span>
                          <button
                            className={`mini-power ${sd.on ? 'active' : ''}`}
                            onClick={() => socket.emit('touch_panel_action', {
                              deviceId: selectedDevice.deviceId,
                              subDeviceIndex: sd.index,
                              type: 'switch',
                              value: !sd.on
                            })}
                          >
                            <Power size={16} />
                          </button>
                        </div>
                        <span className="label">{sd.label}</span>
                        {sd.type === 'fan' && sd.on && (
                          <div className="fan-speed-control">
                            {[1, 2, 3, 4, 5].map(speed => (
                              <button
                                key={speed}
                                className={sd.speed === speed ? 'active' : ''}
                                onClick={() => socket.emit('touch_panel_action', {
                                  deviceId: selectedDevice.deviceId,
                                  subDeviceIndex: sd.index,
                                  type: 'fan',
                                  value: speed
                                })}
                              >
                                {speed}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Side Panels: Energy, Timer, Schedule - ONLY FOR PLUGS */}
            {isPlug && (
              <div className="detail-side-column">
                {renderEnergyMetrics()}

                <div className="control-card glass timer-card">
                  <div className="card-header-row">
                    <h3>Offline Timer</h3>
                    <Moon size={18} />
                  </div>
                  <div className="timer-options">
                    {[5, 15, 30, 60, 0].map(mins => (
                      <button
                        key={mins}
                        className={`timer-btn ${timerInfo.remaining > 0 && mins === 0 ? 'cancel' : ''}`}
                        onClick={() => handleSetTimer(mins, lightStatus ? 'OFF' : 'ON')}
                      >
                        {mins === 0 ? 'OFF' : `${mins}m`}
                      </button>
                    ))}
                  </div>
                  {timerInfo.remaining > 0 && (
                    <div className="timer-status-active">
                      <span className="pulse-dot"></span>
                      Running: {Math.ceil(timerInfo.remaining / 60)} mins remaining
                    </div>
                  )}
                </div>

                <div className="control-card glass schedule-card">
                  <div className="card-header-row">
                    <h3>Schedules</h3>
                    <Activity size={18} />
                  </div>
                  <div className="schedules-list">
                    {(selectedDevice.schedules || []).length === 0 ? (
                      <p className="empty-text">No active schedules</p>
                    ) : (
                      selectedDevice.schedules.map(sch => (
                        <div key={sch.id} className="schedule-item-mini">
                          <div className="sch-info">
                            <span className="time">{sch.startTime} - {sch.endTime}</span>
                            <span className="days">{sch.days.join(', ')}</span>
                          </div>
                          <button className="del-sch" onClick={() => handleRemoveSchedule(sch.id)}>✕</button>
                        </div>
                      ))
                    )}
                  </div>
                  <button className="add-schedule-btn-mini" onClick={() => showToast('Scheduling tool coming soon...')}>+ Add Schedule</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderSensorsSection = () => (
    <div className="dashboard-section animate-fade-in">
      <div className="section-header">
        <div>
          <h2>Custom Sensors</h2>
          <p>Real-time telemetry from custom MQTT topics</p>
        </div>
        <button className="primary-btn" onClick={() => setIsSensorModalOpen(true)}>
          <Plus size={20} />
          Add Sensor
        </button>
      </div>
      
      <div className="devices-grid">
        {sensors.length === 0 ? (
          <div className="empty-state">
            <Radio size={48} className="empty-icon" />
            <p>No sensors added yet</p>
            <button onClick={() => setIsSensorModalOpen(true)}>Configure first sensor</button>
          </div>
        ) : (
          sensors.map(sensor => (
            <SensorCard 
              key={sensor._id} 
              sensor={sensor} 
              onRemove={handleRemoveSensor}
            />
          ))
        )}
      </div>
    </div>
  );

  const renderDashboard = () => (
    <div className="dashboard-view animate-slide-up">
      <div className="welcome-header">
        <div className="header-text">
          <h1>{currentRoom ? currentRoom.name : 'Welcome Home'}</h1>
          <p>{currentRoom ? `Managing ${devices.filter(d => d.room === (currentRoom ? currentRoom.name : d.room)).length} devices` : 'Everything is under control.'}</p>
        </div>
        <div className="header-actions-group">
          {currentRoom ? (
            <button className="action-btn-pill secondary" onClick={() => setCurrentRoom(null)}>
              <LayoutDashboard size={16} /> Back to Rooms
            </button>
          ) : (
            <>
              <button className="action-btn-pill secondary" onClick={() => setIsRoomModalOpen(true)}>
                <Plus size={18} /> Add Room
              </button>
              <button className="action-btn-pill primary" onClick={() => setIsModalOpen(true)}>
                <Plus size={18} /> Add Device
              </button>
            </>
          )}
        </div>
      </div>

      {!currentRoom ? (
        <div className="rooms-grid">
          {(() => {
            const dbRooms = Array.isArray(rooms) ? rooms : [];
            const devList = Array.isArray(devices) ? devices : [];
            const dynamicRooms = Array.from(new Set(devList.filter(d => d.isHomeAssistant && d.room).map(d => d.room)))
              .filter(roomName => roomName !== 'Unassigned' && roomName !== 'Home Assistant' && !dbRooms.find(r => r.name === roomName))
              .map(roomName => ({ name: roomName, icon: '🏠' }));
            
            return [...dbRooms, ...dynamicRooms].map(room => {
              const roomDevices = devList.filter(d => d.room === room.name && d.isConfigured);
              const activeCount = roomDevices.filter(d => d.on).length;
              return (
              <div key={room.name} className="room-card-wrapper">
                <div className="room-card glass card-hover" onClick={() => setCurrentRoom(room)}>
                  <div className="room-card-header">
                    <span className="room-card-icon">{room.icon}</span>
                    <div className={`status-pill ${activeCount > 0 ? 'active' : ''}`}>
                      {activeCount > 0 && <span className="pulse-dot"></span>}
                      {activeCount} Active
                    </div>
                  </div>
                  <div className="room-card-body">
                    <h3>{room.name}</h3>
                    <p>{roomDevices.length} Devices Registered</p>
                  </div>
                  <div className="room-card-footer">
                    <div className="view-link"><span>View Details</span><Activity size={14} /></div>
                  </div>
                </div>
              </div>
            );
          })})()}
        </div>
      ) : (
        <div className="devices-view-content animate-slide-up">
          {(() => {
            const roomSensors = (Array.isArray(sensors) ? sensors : []).filter(s => s.room === currentRoom.name);
            return (
              <>
                {roomSensors.length > 0 && (
                  <div className="sensor-bar" style={{ marginBottom: '24px' }}>
                    {roomSensors.map(sensor => {
                      let Icon = Radio;
                      const n = (sensor.name || '').toLowerCase();
                      if (n.includes('temp')) Icon = Thermometer;
                      else if (n.includes('humid')) Icon = Droplets;
                      else if (n.includes('lux') || n.includes('light')) Icon = Sun;
                      else if (n.includes('motion') || n.includes('pres')) Icon = Footprints;
                      else if (n.includes('co2') || n.includes('air')) Icon = Activity;
                      
                      let val = sensor.value;
                      if (typeof val === 'string' && val.startsWith('{')) {
                        try {
                          const parsed = JSON.parse(val);
                          val = parsed;
                        } catch (e) {}
                      }
                      if (typeof val === 'object' && val !== null) {
                        val = val.value !== undefined ? val.value : (val.val !== undefined ? val.val : JSON.stringify(val));
                      }
                      
                      return (
                        <div className="sensor-chip" key={sensor._id}>
                          <span className="icon"><Icon size={20} /></span>
                          <div className="info">
                            <span className="label">{sensor.name}</span>
                            <span className="val">{val}{sensor.unit ? ` ${sensor.unit}` : ''}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
                
                <MusicDeck 
                  socket={socket}
                  players={(Array.isArray(devices) ? devices : []).filter(d => d.room === currentRoom.name && d.type === 'media_player' && d.deviceClass !== 'tv')} 
                  allMediaPlayers={(Array.isArray(devices) ? devices : []).filter(d => d.type === 'media_player')}
                  onCommand={handleMediaCommand} 
                />

                <div className="devices-grid">
                  {(Array.isArray(devices) ? devices : []).filter(d => d.room === currentRoom.name && d.isConfigured && d.type !== 'media_player').map(device => (
                    <DeviceCard
                      key={device.deviceId}
                      deviceId={device.deviceId}
                      title={device.title}
                      status={device.isOnline}
                      on={device.on}
                      icon={device.icon || "💡"}
                      type={device.type}
                      onToggle={() => toggleLight(!device.on)}
                      onAction={(action) => {
                        if (action === 'navigate') setSelectedDevice(device);
                        else if (action === 'edit') setConfiguringDevice(device);
                        else if (action === 'remove') handleRemoveDevice(device.deviceId);
                      }}
                    />
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );

  const renderDevicesView = () => (
    <div className="devices-view animate-slide-up">
      <div className="welcome-header">
        <div className="header-text">
          <h1>All Devices</h1>
          <p>Managing {devices.length} appliances across your home</p>
        </div>
        <div className="header-actions-group">
          <button className="action-btn-pill primary" onClick={() => setIsModalOpen(true)}>
            <Plus size={18} /> Add Device
          </button>
        </div>
      </div>

      <div className="devices-grid">
        {devices.map(device => (
          <DeviceCard
            key={device.deviceId}
            deviceId={device.deviceId}
            title={device.title}
            status={device.isOnline}
            on={device.on}
            icon={device.icon || "💡"}
            type={device.type}
            onToggle={() => toggleLight(!device.on)}
            onAction={(action) => {
              if (action === 'navigate') {
                setSelectedDevice(device);
              } else if (action === 'edit') {
                setConfiguringDevice(device);
              } else if (action === 'remove') {
                handleRemoveDevice(device.deviceId);
              }
            }}
          />
        ))}
      </div>
    </div>
  );

  const renderSettingsView = () => (
    <div className="settings-view animate-slide-up">
      <div className="welcome-header">
        <div className="header-text">
          <h1>System Settings</h1>
          <p>Configure your smart home preferences</p>
        </div>
      </div>

      <div className="settings-grid">
        <div className="settings-card glass">
          <h3>🎨 Appearance</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="label">Dark Mode</span>
              <span className="desc">Switch between light and dark themes</span>
            </div>
            <button className={`toggle-switch ${isDarkMode ? 'on' : ''}`} onClick={() => setIsDarkMode(!isDarkMode)}>
              <span className="knob"></span>
            </button>
          </div>
        </div>

        <div className="settings-card glass">
          <h3>📡 System Status</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="label">MQTT Broker</span>
              <span className="desc">Real-time communication status</span>
            </div>
            <div className={`status-pill ${mqttStatus === 'Connected' ? 'active' : ''}`}>
              {mqttStatus}
            </div>
          </div>
          <div className="setting-item">
            <div className="setting-info">
              <span className="label">API Endpoint</span>
              <span className="desc">{API_BASE}</span>
            </div>
          </div>
        </div>

        <div className="settings-card glass">
          <h3>🏠 Room Management</h3>
          <div className="rooms-list-mini">
            {(Array.isArray(rooms) ? rooms : []).map(room => (
              <div key={room.name} className="room-item-mini">
                <span>{room.icon} {room.name}</span>
                <button className="delete-btn-mini" onClick={() => handleRemoveRoom(room.name)}>Remove</button>
              </div>
            ))}
          </div>
          <button className="add-room-btn glass" style={{ width: '100%', marginTop: '16px' }} onClick={() => setIsRoomModalOpen(true)}>
            + Add New Room
          </button>
        </div>

        <div className="settings-card glass">
          <h3>ℹ️ About</h3>
          <div className="setting-item">
            <div className="setting-info">
              <span className="label">Smart Home OS</span>
              <span className="desc">Version 2.4.0 (Stable Build)</span>
            </div>
          </div>
          <div className="setting-item">
            <p className="about-text">A professional-grade smart home management system designed for speed, security, and elegance.</p>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />
      <main className="content">
        <header className="top-bar glass">
          <div className="search-bar">
            <Search size={18} color="var(--text-muted)" />
            <input
              type="text"
              placeholder="Search devices, rooms..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <div className="status-chips">
            <button className="theme-toggle-btn" onClick={() => setIsDarkMode(!isDarkMode)}>
              {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            <div className={`status-badge ${mqttStatus === 'Connected' ? 'success' : 'warning'}`}>
              <span className="dot"></span>
              {mqttStatus === 'Connected' ? 'Live' : 'Connecting'}
            </div>
            <div className="profile-chip">
              <img src="https://api.dicebear.com/9.x/thumbs/svg?seed=Luna" alt="Avatar" />
              <div className="profile-info">
                <span className="name">Admin</span>
              </div>
            </div>
          </div>
        </header>
        <div className="view-container">
          {searchQuery ? (
            <div className="search-results animate-slide-up">
              <div className="welcome-header">
                <div className="header-text">
                  <h1>Search Results</h1>
                  <p>Found {filteredDevices.length} devices matching "{searchQuery}"</p>
                </div>
                <button className="action-btn-pill secondary" onClick={() => setSearchQuery('')}>Clear Search</button>
              </div>
              <div className="devices-grid">
                {(Array.isArray(filteredDevices) ? filteredDevices : []).map(device => (
                  <DeviceCard
                    key={device.deviceId}
                    deviceId={device.deviceId}
                    title={device.title}
                    status={device.isOnline}
                    on={device.on}
                    icon={device.icon || "💡"}
                    type={device.type}
                    onToggle={() => toggleLight(!device.on)}
                    onAction={(action) => {
                      if (action === 'navigate') setSelectedDevice(device);
                      else if (action === 'edit') setConfiguringDevice(device);
                      else if (action === 'remove') handleRemoveDevice(device.deviceId);
                    }}
                  />
                ))}
              </div>
            </div>
          ) : selectedDevice ? (
            renderDetailView()
          ) : (
            <>
              {activeTab === 'dashboard' && renderDashboard()}
              {activeTab === 'scenes' && <Scenes socket={socket} rooms={rooms} allDevices={devices} sensors={sensors} onAddRoom={handleAddRoom} />}
              {activeTab === 'sensors' && renderSensorsSection()}
              {activeTab === 'devices' && renderDevicesView()}
              {activeTab === 'staircase' && <Staircase socket={socket} mqttStatus={mqttStatus} />}
              {activeTab === 'settings' && renderSettingsView()}
            </>
          )}
        </div>
      </main>
      <AddSensorModal 
        isOpen={isSensorModalOpen} 
        onClose={() => setIsSensorModalOpen(false)}
        onAdd={handleAddSensor}
        rooms={rooms}
      />
      <ProvisioningModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onFinish={handleAddDevice} />
      <AddRoomModal isOpen={isRoomModalOpen} onClose={() => setIsRoomModalOpen(false)} onAdd={handleAddRoom} />
      <ConfigureDeviceModal isOpen={!!configuringDevice} device={configuringDevice} onClose={() => setConfiguringDevice(null)} onConfigure={handleConfigureDevice} />
      {toast && <div className="toast"><span>💡</span> {toast}</div>}
    </div>
  );
};

export default App;
