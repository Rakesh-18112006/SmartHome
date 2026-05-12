import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { Power, Search, LayoutDashboard, Settings, Plus, Activity, Thermometer, Moon, Sun } from 'lucide-react';
import Sidebar from './components/Sidebar';
import DeviceCard from './components/DeviceCard';
import ColorControl from './components/ColorControl';
import Scenes from './components/Scenes';
import AddRoomModal from './components/AddRoomModal';
import ConfigureDeviceModal from './components/ConfigureDeviceModal';
import ProvisioningModal from './components/ProvisioningModal';





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
  const [configuringDevice, setConfiguringDevice] = useState(null);
  const [currentRoom, setCurrentRoom] = useState(null);
  const [timerInfo, setTimerInfo] = useState({ remaining: 0, action: null });
  const [metrics, setMetrics] = useState({});
  const [toast, setToast] = useState(null);
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

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 4000);
  };






  const isInteracting = useRef(false);

  useEffect(() => {
    fetchDevices();
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`);
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
    }
  };

  const fetchDevices = async () => {

    try {
      const res = await fetch(`${API_BASE}/api/devices`);
      const data = await res.json();
      setDevices(data);
    } catch (err) {
      console.error('Failed to fetch devices', err);
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

    // Automatic refresh every 5 seconds as requested
    const refreshInterval = setInterval(fetchDevices, 5000);

    socket.on('mqtt_status', (data) => setMqttStatus(data.status));

    // Global state sync from server for any device
    socket.on('device_state_update', (updatedDevice) => {
      // Calculate online status in real-time
      const now = new Date();
      const lastSeen = updatedDevice.lastSeen ? new Date(updatedDevice.lastSeen) : null;
      updatedDevice.isOnline = lastSeen && (now - lastSeen) < 45000;

      // Update the main devices list so the dashboard reflects changes
      setDevices(prev => prev.map(d => d.deviceId === updatedDevice.deviceId ? { ...updatedDevice, isOnline: updatedDevice.isOnline } : d));

      // If we're looking at this specific device, sync the detailed UI
      if (selectedDevice && selectedDevice.deviceId === updatedDevice.deviceId) {
        setSelectedDevice(updatedDevice); // Keep selectedDevice in sync
        if (!isInteracting.current) {
          // Detect timer completion
          if (timerInfo.remaining > 0 && (updatedDevice.timerRemaining === 0 || !updatedDevice.timerRemaining)) {
            showToast(`✅ Timer completed: ${updatedDevice.title} is now ${updatedDevice.on ? 'ON' : 'OFF'}`);
          }

          setLightStatus(updatedDevice.on);
          setBrightness(updatedDevice.brightness);
          setAutoMode(updatedDevice.effect === 'auto');
          setCurrentLux(updatedDevice.lastLux || 0);
          setTimerInfo({
            remaining: updatedDevice.timerRemaining || 0,
            action: updatedDevice.timerAction
          });
          setMetrics({
            voltage: updatedDevice.voltage,
            current: updatedDevice.current,
            power: updatedDevice.power,
            energy: updatedDevice.energy,
            pf: updatedDevice.pf,
            temp: updatedDevice.temperature
          });
        }
      }
    });

    socket.on('mqtt_message', (data) => {
      // Keep for debugging logs
    });

    return () => {
      socket.off('mqtt_status');
      socket.off('device_state_update');
      socket.off('mqtt_message');
      clearInterval(refreshInterval);
    };
  }, [selectedDevice, timerInfo]);

  const toggleLight = (val) => {
    setLightStatus(val);
    if (selectedDevice) {
      // Use the PDF format for plugs/switches, default for others
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
        action: action // 10 for off, 11 for on
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

  const handleBrightness = (val) => {
    if (autoMode) return;
    const value = parseInt(val);
    setBrightness(value);
    setWhiteIntensity(value); // Sync with brightness
    if (selectedDevice) {
      socket.emit('brightness_change', { deviceId: selectedDevice.deviceId, brightness: value, w: value });
    }
  };

  const handleColorChange = (color) => {
    if (selectedDevice) {
      socket.emit('color_change', { deviceId: selectedDevice.deviceId, ...color, w: whiteIntensity });
    }
  };

  const handleWhiteIntensity = (val) => {
    const value = parseInt(val);
    setWhiteIntensity(value);
    if (selectedDevice) {
      socket.emit('white_change', { deviceId: selectedDevice.deviceId, white: value });
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

  // Render the detailed view for a light
  const renderDetailView = () => (
    <div className="detail-view animate-fade-in">
      <header className="detail-header">
        <button className="back-btn" onClick={() => setSelectedDevice(null)}>
          ← Back to Dashboard
        </button>
        <div className="title-row">
          <div className="title-left">
            <h1>{selectedDevice.title}</h1>
            <button className="edit-settings-btn" onClick={() => setConfiguringDevice(selectedDevice)}>
              <Settings size={18} />
            </button>
          </div>
          <div className={`mode-badge ${autoMode ? 'auto' : ''}`}>
            {autoMode ? 'Auto Mode Active' : 'Manual Mode'}
          </div>
        </div>
      </header>

      <div className="detail-content">
        {selectedDevice.type === 'light' && (
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

          </div>
        )}

        {selectedDevice.type === 'rgbw' && (
          <>
            <div className="control-section main-controls">
              <div className="control-card">
                <h3>Power</h3>
                <div className="big-toggle">
                  <span className={lightStatus ? 'on' : 'off'}>{lightStatus ? 'ON' : 'OFF'}</span>
                  <button
                    className={`power-btn ${lightStatus ? 'active' : ''}`}
                    onClick={() => toggleLight(!lightStatus)}
                  >
                    <Power size={28} />
                  </button>
                </div>
              </div>
              <div className="control-card">
                <h3>Master Brightness</h3>
                <div className="slider-container">
                  <div className="value-display">{Math.round((brightness / 255) * 100)}%</div>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={brightness}
                    onMouseDown={() => { isInteracting.current = true; }}
                    onMouseUp={() => { isInteracting.current = false; }}
                    onChange={(e) => handleBrightness(e.target.value)}
                  />
                </div>
              </div>

            </div>
            <div className="control-section color-controls">
              <div className="control-card color-picker-card">
                <h3>Color Palette</h3>
                <ColorControl onColorChange={handleColorChange} />
              </div>
            </div>
          </>
        )}
        {/* Touch Panel Monitor */}
        {selectedDevice.type === 'touch-panel' && (
          <div className="touch-panel-control animate-fade-in">
            <div className="monitor-header">
              <div className="header-left">
                <h3>Multi-Switch Panel</h3>
                <div className="status-badge online">Touch Enabled</div>
              </div>
              <button
                className="master-off-btn"
                onClick={() => {
                  if (window.confirm('Turn off all switches?')) {
                    socket.emit('touch_panel_all_off', { deviceId: selectedDevice.deviceId });
                  }
                }}
              >
                All OFF
              </button>
            </div>

            <div className="touch-grid">
              {(selectedDevice.subDevices || []).map((sd) => (
                <div key={sd.index} className={`touch-item ${sd.type} ${sd.on ? 'active' : ''}`}>
                  <div className="touch-item-header">
                    <span className="icon">{sd.type === 'fan' ? '🌀' : '💡'}</span>
                    <button
                      className={`sub-power-btn ${sd.on ? 'active' : ''}`}
                      onClick={() => socket.emit('touch_panel_action', {
                        deviceId: selectedDevice.deviceId,
                        subDeviceIndex: sd.index,
                        type: 'switch',
                        value: !sd.on
                      })}
                    >
                      <Power size={18} />
                    </button>
                  </div>
                  <div className="touch-item-body">
                    <span className="label">{sd.label}</span>
                    <span className="status">{sd.on ? 'Active' : 'Off'}</span>
                  </div>

                  {sd.type === 'fan' && sd.on && (
                    <div className="fan-controls">
                      <div className="speed-selector">
                        {[1, 2, 3, 4, 5].map(speed => (
                          <button
                            key={speed}
                            className={`speed-btn ${sd.speed === speed ? 'active' : ''}`}
                            onClick={() => socket.emit('touch_panel_action', {
                              deviceId: selectedDevice.deviceId,
                              subDeviceIndex: sd.index,
                              type: 'fan_speed',
                              value: speed
                            })}
                          >
                            {speed}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Single Phase Monitor */}
        {selectedDevice.deviceId.startsWith('B1E') && (
          <div className="single-phase-monitor animate-fade-in">
            <div className="monitor-header">
              <h3>Home Energy Monitor</h3>
              <div className="status-badge online">Active Monitoring</div>
            </div>

            <div className="energy-summary single">
              <div className="summary-card active full-width">
                <div className="card-bg-icon">⚡</div>
                <span className="label">Total Energy Consumption</span>
                <div className="value-container">
                  <span className="value">{selectedDevice.energy || 0}</span>
                  <span className="unit">kWh</span>
                </div>
              </div>
            </div>

            <div className="metrics-row-highlights">
              <div className="metric-card highlight">
                <span className="label">Voltage</span>
                <span className="value">{selectedDevice.voltage || 0}<small>V</small></span>
              </div>
              <div className="metric-card highlight">
                <span className="label">Current</span>
                <span className="value">{selectedDevice.current || 0}<small>A</small></span>
              </div>
              <div className="metric-card highlight power">
                <span className="label">Active Power</span>
                <span className="value">{selectedDevice.power || 0}<small>W</small></span>
              </div>
            </div>

            <div className="secondary-metrics-list">
              <div className="sec-item">
                <span className="label">Power Factor</span>
                <span className="value">{selectedDevice.pf || 0}</span>
              </div>
              <div className="sec-item">
                <span className="label">Apparent Power</span>
                <span className="value">{selectedDevice.apparentPowerR || 0} VA</span>
              </div>
            </div>
          </div>
        )}

        {/* Three Phase Monitor */}
        {selectedDevice.deviceId.startsWith('B3E') && (
          <div className="three-phase-monitor animate-fade-in">
            <div className="monitor-header">
              <h3>Industrial Energy Monitor</h3>
              <div className="phase-legend">
                <span className="phase r">R-Phase</span>
                <span className="phase y">Y-Phase</span>
                <span className="phase b">B-Phase</span>
              </div>
            </div>

            <div className="metrics-table">
              <div className="metrics-row header">
                <div className="col">Metric</div>
                <div className="col">R-Phase</div>
                <div className="col">Y-Phase</div>
                <div className="col">B-Phase</div>
              </div>

              <div className="metrics-row">
                <div className="col label">Voltage (V)</div>
                <div className="col val r">{selectedDevice.voltageR || 0}</div>
                <div className="col val y">{selectedDevice.voltageY || 0}</div>
                <div className="col val b">{selectedDevice.voltageB || 0}</div>
              </div>

              <div className="metrics-row">
                <div className="col label">Current (A)</div>
                <div className="col val r">{selectedDevice.currentR || 0}</div>
                <div className="col val y">{selectedDevice.currentY || 0}</div>
                <div className="col val b">{selectedDevice.currentB || 0}</div>
              </div>

              <div className="metrics-row">
                <div className="col label">Power (W)</div>
                <div className="col val r">{selectedDevice.powerR || 0}</div>
                <div className="col val y">{selectedDevice.powerY || 0}</div>
                <div className="col val b">{selectedDevice.powerB || 0}</div>
              </div>

              <div className="metrics-row">
                <div className="col label">PF</div>
                <div className="col val r">{selectedDevice.pfR || 0}</div>
                <div className="col val y">{selectedDevice.pfY || 0}</div>
                <div className="col val b">{selectedDevice.pfB || 0}</div>
              </div>
            </div>

            <div className="energy-summary">
              <div className="summary-card active">
                <span className="label">Total Energy</span>
                <span className="value">{selectedDevice.energy || 0} <small>kWh</small></span>
              </div>
              <div className="summary-card">
                <span className="label">Apparent</span>
                <span className="value">{selectedDevice.apparentEnergy || 0} <small>kVAh</small></span>
              </div>
            </div>
          </div>
        )}

        {/* Smart Plug / Switch Controls */}
        {(selectedDevice.type === 'plug' || selectedDevice.type === 'switch' || selectedDevice.deviceId.startsWith('BSP')) && (
          <div className="control-section">
            <div className="control-card">
              <h3>Power Status</h3>
              <div className="big-toggle">
                <span className={lightStatus ? 'on' : 'off'}>{lightStatus ? 'ON' : 'OFF'}</span>
                <button
                  className={`power-btn ${lightStatus ? 'active' : ''}`}
                  onClick={() => toggleLight(!lightStatus)}
                >
                  <Power size={28} />
                </button>
              </div>

              <div className="metrics-grid">
                <div className="metric-item">
                  <span className="label">Voltage</span>
                  <span className="value">{selectedDevice.voltage || 0}V</span>
                </div>
                <div className="metric-item">
                  <span className="label">Current</span>
                  <span className="value">{selectedDevice.current || 0}A</span>
                </div>
                <div className="metric-item">
                  <span className="label">Power</span>
                  <span className="value">{selectedDevice.power || 0}W</span>
                </div>
                <div className="metric-item">
                  <span className="label">Energy</span>
                  <span className="value">{selectedDevice.energy || 0}kWh</span>
                </div>
              </div>
            </div>

            <div className="control-card timer-card">
              <div className="card-header-row">
                <h3>Offline Timer</h3>
                <span className="info-badge">Auto-off/on</span>
              </div>
              <p className="subtitle">Set a timer for the device to automatically switch state.</p>

              {selectedDevice.timerRemaining > 0 && (
                <div className="timer-status-active animate-pulse-soft">
                  <div className="status-header">
                    <span className="pulse-dot"></span>
                    <strong>Timer Running</strong>
                  </div>
                  <div className="status-details">
                    <span className="time">{Math.floor(selectedDevice.timerRemaining / 60)}m {selectedDevice.timerRemaining % 60}s</span>
                    <span className="action">to turn {selectedDevice.timerAction === '10' ? 'OFF' : 'ON'}</span>
                  </div>
                </div>
              )}

              <div className="timer-controls">
                <div className="timer-input-group">
                  <input type="number" id="timer-mins" placeholder="Mins" min="1" defaultValue="1" />
                  <span>minutes</span>
                </div>
                <div className="timer-actions">
                  <button className="timer-btn off" onClick={() => {
                    const mins = document.getElementById('timer-mins').value;
                    handleSetTimer(mins, "10");
                  }}>Turn OFF</button>
                  <button className="timer-btn on" onClick={() => {
                    const mins = document.getElementById('timer-mins').value;
                    handleSetTimer(mins, "11");
                  }}>Turn ON</button>
                </div>
              </div>
              <button className="cancel-timer-btn" onClick={() => handleSetTimer("0", "0")}>
                Disable Timer
              </button>
            </div>

            <div className="control-card scheduler-card">
              <div className="card-header-row">
                <h3>Daily Schedules</h3>
                <span className="info-badge">Auto-State</span>
              </div>
              <div className="schedule-list">
                {(selectedDevice.schedules || []).map(s => (
                  <div key={s._id} className="schedule-item range">
                    <div className="schedule-info">
                      <div className="time-range">
                        <span className="label">Mode:</span>
                        <span className={`mode-badge ${s.startAction.toLowerCase()}`}>{s.startAction} ➔ {s.endAction}</span>
                        <span className="time">{s.startTime} - {s.endTime}</span>
                      </div>
                      <div className="day-badges">
                        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                          <span key={d} className={`day-dot ${s.days.includes(d) ? 'active' : ''}`}>{d[0]}</span>
                        ))}
                      </div>
                    </div>
                    <button className="delete-schedule" onClick={() => handleRemoveSchedule(s._id)}>×</button>
                  </div>
                ))}
              </div>
              <div className="add-schedule-form advanced">
                <div className="form-row">
                  <div className="input-group">
                    <label>Range Start</label>
                    <input type="time" id="sched-start" defaultValue="08:00" />
                  </div>
                  <div className="input-group">
                    <label>Range End</label>
                    <input type="time" id="sched-end" defaultValue="18:00" />
                  </div>
                </div>
                <div className="input-group">
                  <label>Action Pattern</label>
                  <select id="sched-pattern">
                    <option value="ON-OFF">ON during period (ON at start, OFF at end)</option>
                    <option value="OFF-ON">OFF during period (OFF at start, ON at end)</option>
                  </select>
                </div>
                <div className="day-selector-header">
                  <label>Execution Days</label>
                  <button className="toggle-all-btn" onClick={() => {
                    const checkboxes = document.querySelectorAll('.day-input');
                    const allChecked = Array.from(checkboxes).every(c => c.checked);
                    checkboxes.forEach(c => c.checked = !allChecked);
                  }}>Toggle All</button>
                </div>
                <div className="day-selector">
                  {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
                    <label key={d} className="day-check">
                      <input type="checkbox" className="day-input" value={d} defaultChecked />
                      <span>{d[0]}</span>
                    </label>
                  ))}
                </div>
                <button className="add-btn" onClick={() => {
                  const start = document.getElementById('sched-start').value;
                  const end = document.getElementById('sched-end').value;
                  const pattern = document.getElementById('sched-pattern').value;
                  const [startAction, endAction] = pattern.split('-');
                  const days = Array.from(document.querySelectorAll('.day-input:checked')).map(i => i.value);
                  if (days.length === 0) return showToast("⚠️ Select at least one day");
                  handleAddSchedule(start, end, days, startAction, endAction);
                }}>Save Advanced Schedule</button>
              </div>
            </div>

            <div className="control-card stat-card">
              <p>Device health</p>
              <h3>Online & Stable</h3>
            </div>
          </div>
        )}

        {selectedDevice.type === 'curtain' && (
          <div className="control-section">
            <div className="control-card">
              <h3>Manual Controls</h3>
              <div className="curtain-actions-grid">
                <button
                  className="curtain-btn open-btn"
                  onPointerDown={() => handleCurtainAction(11)}
                  onPointerUp={() => handleCurtainAction(10)}
                  onMouseLeave={() => handleCurtainAction(10)}
                >
                  <span className="btn-icon">↔️</span>
                  <span className="btn-text">OPEN CURTAIN</span>
                </button>
                <button
                  className="curtain-btn close-btn"
                  onPointerDown={() => handleCurtainAction(21)}
                  onPointerUp={() => handleCurtainAction(20)}
                  onMouseLeave={() => handleCurtainAction(20)}
                >
                  <span className="btn-icon">➡️⬅️</span>
                  <span className="btn-text">CLOSE CURTAIN</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {selectedDevice.type === 'sensor' && (
          <div className="control-section">
            <div className="control-card sensor-display">
              <div className="sensor-item">
                <span className="sensor-label">Temperature</span>
                <span className="sensor-value">24°C</span>
              </div>
              <div className="sensor-item">
                <span className="sensor-label">Humidity</span>
                <span className="sensor-value">45%</span>
              </div>
              <div className="sensor-item">
                <span className="sensor-label">Motion</span>
                <span className="sensor-value no">No Motion</span>
              </div>
            </div>
          </div>
        )}
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
                  status={device.isOnline}
                  on={device.deviceId === 'light-1' ? lightStatus : device.on}
                  icon={device.icon || "💡"}
                  type={device.type}
                  timerRemaining={device.timerRemaining}
                  onToggle={device.deviceId === 'light-1' ? toggleLight : () => { }}
                  onAction={(action) => {
                    if (action === 'navigate') {
                      setSelectedDevice(device);
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
            <button
              className="theme-toggle-btn"
              onClick={() => setIsDarkMode(!isDarkMode)}
              title="Toggle Dark Mode"
            >
              {isDarkMode ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <span className={`chip ${mqttStatus === 'Connected' ? 'success' : 'warning'}`}>
              MQTT: {mqttStatus}
            </span>
            <span className="profile-chip">
              <img src="https://api.dicebear.com/9.x/thumbs/svg?seed=Luna" alt="Avatar" />
              <span>Homee</span>
            </span>
          </div>
        </header>
        {activeTab === 'scenes'
          ? <Scenes
            socket={socket}
            rooms={rooms}
            allDevices={devices}
            onAddRoom={handleAddRoom}
          />
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
        {toast && (
          <div className="toast-notification animate-slide-up">
            {toast}
          </div>
        )}
      </main>




      <style jsx>{`
        .app-container { display: flex; min-height: 100vh; }
        .content { margin-left: 260px; flex: 1; padding: 32px 48px; }
        .top-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
        .search-bar { background: var(--bg-card); padding: 10px 20px; border-radius: 100px; border: 1px solid var(--border); display: flex; align-items: center; gap: 12px; width: 300px; }
        .search-bar input { border: none; outline: none; width: 100%; font-size: 14px; }
        .status-chips { display: flex; align-items: center; gap: 16px; }
        .theme-toggle-btn { display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; border-radius: 50%; background: var(--bg-card); border: 1px solid var(--border); color: var(--text-main); transition: var(--transition); }
        .theme-toggle-btn:hover { background: var(--bg-secondary); transform: scale(1.05); }
        .chip { padding: 6px 14px; border-radius: 100px; font-size: 12px; font-weight: 600; }
        .chip.success { background: #dcfce7; color: #166534; }
        .chip.warning { background: #fef9c3; color: #854d0e; }
        .profile-chip { display: flex; align-items: center; gap: 10px; padding: 4px 14px 4px 4px; background: var(--bg-card); border: 1px solid var(--border); border-radius: 100px; font-size: 13px; font-weight: 600; }
        .profile-chip img { width: 32px; height: 32px; border-radius: 50%; background: var(--bg-tertiary); }
        .welcome-header h1 { font-size: 32px; letter-spacing: -1px; margin-bottom: 8px; }
        .welcome-header p { color: var(--text-muted); margin-bottom: 32px; }
        .quick-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-bottom: 40px; }
        .stat-card { background: var(--bg-card); padding: 24px; border-radius: 24px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); }
        .stat-card p { font-size: 13px; color: var(--text-muted); margin-bottom: 4px; }
        .stat-card h2 { font-size: 24px; font-weight: 700; }
        
        .discovery-section { background: var(--bg-secondary); border: 2px dashed #cbd5e1; border-radius: 24px; padding: 24px; margin-bottom: 40px; }
        .discovery-header { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
        .discovery-header h2 { font-size: 16px; font-weight: 700; color: var(--primary); text-transform: uppercase; letter-spacing: 1px; }
        .pulse-icon { width: 10px; height: 10px; background: var(--primary); border-radius: 50%; box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.4); animation: pulse 2s infinite; }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0.7); } 70% { box-shadow: 0 0 0 10px rgba(37, 99, 235, 0); } 100% { box-shadow: 0 0 0 0 rgba(37, 99, 235, 0); } }
        
        .discovery-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 16px; }
        .discovery-card { background: var(--bg-card); padding: 16px; border-radius: 16px; display: flex; align-items: center; gap: 16px; cursor: pointer; transition: var(--transition); border: 1px solid var(--border); }
        .discovery-card:hover { transform: translateY(-2px); border-color: var(--primary); box-shadow: var(--shadow); }
        .discovery-icon { font-size: 24px; width: 48px; height: 48px; background: var(--bg-tertiary); border-radius: 12px; display: flex; align-items: center; justify-content: center; }
        .discovery-info h4 { font-size: 14px; font-weight: 700; color: var(--text-main); margin-bottom: 2px; }
        .discovery-info p { font-size: 12px; color: var(--text-muted); }
        .assign-btn { margin-left: auto; padding: 6px 14px; background: var(--primary); color: white; border-radius: 8px; font-size: 12px; font-weight: 700; }

        .section-title { margin: 32px 0 20px; }

        .section-title h2 { font-size: 18px; font-weight: 600; }
        .back-link { background: none; color: var(--primary); font-weight: 700; font-size: 14px; margin-top: 8px; display: block; }
        
        .rooms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 32px; margin-top: 20px; }
        .room-card-wrapper { position: relative; }
        .room-card { background: var(--bg-card); padding: 32px; border-radius: 28px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); cursor: pointer; transition: var(--transition); }
        .room-card:hover { transform: translateY(-6px); box-shadow: var(--shadow); border-color: var(--primary); }
        .room-delete-btn { 
          position: absolute; top: 12px; right: 12px; width: 28px; height: 28px; 
          background: #fee2e2; color: #ef4444; border-radius: 50%; 
          display: flex; align-items: center; justify-content: center; 
          font-size: 18px; font-weight: 700; opacity: 0.6; transition: var(--transition);
        }
        .room-card-wrapper:hover .room-delete-btn { opacity: 1; }
        .room-delete-btn:hover { background: #ef4444; color: white; }
        
        .title-row { display: flex; justify-content: space-between; align-items: center; margin-top: 16px; }
        .title-left { display: flex; align-items: center; gap: 12px; }
        .edit-settings-btn { width: 36px; height: 36px; border-radius: 50%; background: var(--bg-secondary); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center; color: var(--text-muted); transition: var(--transition); }
        .edit-settings-btn:hover { background: var(--primary); color: white; border-color: var(--primary); }
        
        .room-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }

        .room-card-icon { font-size: 32px; width: 64px; height: 64px; background: var(--bg-secondary); border-radius: 16px; display: flex; align-items: center; justify-content: center; transition: var(--transition); }
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
        
        .add-room-btn { display: flex; align-items: center; gap: 10px; padding: 14px 28px; background: var(--bg-card); color: var(--primary); border: 1px solid var(--primary); border-radius: 100px; font-weight: 700; transition: var(--transition); }
        .add-room-btn:hover { background: rgba(37, 99, 235, 0.05); transform: translateY(-2px); }
        .add-room-btn span { font-size: 18px; }
        
        .curtain-actions { display: flex; gap: 12px; margin-top: 20px; }
        .curtain-actions button { flex: 1; padding: 10px; border-radius: 12px; background: var(--bg-tertiary); font-weight: 700; color: var(--primary); transition: var(--transition); }
        .curtain-actions button:hover { background: var(--primary); color: white; }

        .sensor-display { display: flex; flex-direction: column; gap: 20px; }
        .sensor-item { display: flex; justify-content: space-between; align-items: center; padding-bottom: 12px; border-bottom: 1px solid var(--border); }
        .sensor-item:last-child { border-bottom: none; }
        .sensor-label { font-size: 14px; font-weight: 600; color: var(--text-muted); }
        .sensor-value { font-size: 20px; font-weight: 800; color: var(--text-main); }
        .sensor-value.no { color: #94a3b8; }

        .timer-card { background: var(--bg-secondary); border: 2px dashed var(--border); }
        .info-badge { padding: 4px 10px; background: #e0f2fe; color: #0369a1; border-radius: 100px; font-size: 11px; font-weight: 700; text-transform: uppercase; }
        .timer-controls { display: flex; flex-direction: column; gap: 16px; margin: 16px 0; }
        .timer-input-group { display: flex; align-items: center; gap: 12px; }
        .timer-input-group input { width: 80px; padding: 12px; border-radius: 12px; border: 1px solid var(--border); font-weight: 700; text-align: center; font-size: 18px; }
        .timer-input-group span { font-weight: 600; color: var(--text-muted); }
        .timer-actions { display: flex; gap: 12px; }
        .timer-btn { flex: 1; padding: 12px; border-radius: 12px; font-weight: 700; transition: var(--transition); }
        .timer-btn.off { background: #fee2e2; color: #dc2626; }
        .timer-btn.on { background: #dcfce7; color: #166534; }
        .timer-btn:hover { transform: translateY(-2px); filter: brightness(0.95); }
        .cancel-timer-btn { width: 100%; padding: 10px; background: none; border: 1px solid var(--border); border-radius: 12px; color: var(--text-muted); font-size: 13px; font-weight: 600; transition: var(--transition); }
        .cancel-timer-btn:hover { background: var(--bg-tertiary); color: var(--text-main); }

        .timer-status-active { background: var(--bg-card); border: 1px solid #bae6fd; border-radius: 16px; padding: 16px; margin: 16px 0; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 4px 12px rgba(186, 230, 253, 0.2); }
        .status-header { display: flex; align-items: center; gap: 8px; color: #0369a1; font-size: 13px; }
        .pulse-dot { width: 8px; height: 8px; background: #0ea5e9; border-radius: 50%; box-shadow: 0 0 0 0 rgba(14, 165, 233, 0.4); animation: pulse 2s infinite; }
        .status-details { display: flex; justify-content: space-between; align-items: baseline; }
        .status-details .time { font-size: 24px; font-weight: 800; color: var(--text-main); letter-spacing: -0.5px; }
        .status-details .action { font-size: 12px; font-weight: 600; color: var(--text-muted); }

        @keyframes pulse-soft { 0% { opacity: 1; } 50% { opacity: 0.8; } 100% { opacity: 1; } }
        .animate-pulse-soft { animation: pulse-soft 2s ease-in-out infinite; }

        @media (max-width: 1024px) { 
          .sidebar { width: 80px; padding: 24px 12px; } 
          .logo-text, .nav-label { display: none; } 
          .content { margin-left: 80px; padding: 24px; } 
          .device-grid { grid-template-columns: 1fr 1fr; } 
        }

        @media (max-width: 768px) {
          .app-container { flex-direction: column; }
          .sidebar { 
            position: fixed; 
            bottom: 0; 
            left: 0; 
            right: 0; 
            width: 100%; 
            height: 70px; 
            flex-direction: row; 
            padding: 0 20px; 
            z-index: 1000; 
            border-radius: 20px 20px 0 0;
            border-right: none;
            border-top: 1px solid var(--border);
            box-shadow: 0 -10px 30px rgba(0,0,0,0.05);
          }
          .sidebar .logo { display: none; }
          .sidebar nav { flex-direction: row; justify-content: space-around; width: 100%; margin: 0; }
          .nav-item { flex-direction: column; padding: 10px; gap: 4px; }
          .nav-item .nav-label { display: block; font-size: 10px; }
          
          .content { margin-left: 0; padding: 20px; padding-bottom: 100px; }
          .top-bar { flex-direction: column; gap: 16px; align-items: flex-start; }
          .search-bar { width: 100%; }
          .status-chips { width: 100%; justify-content: space-between; }
          
          .quick-stats { grid-template-columns: 1fr; gap: 12px; }
          .device-grid { grid-template-columns: 1fr; gap: 16px; }
          
          .control-section { padding: 0; }
          .detail-header { flex-direction: column; align-items: flex-start; gap: 12px; }
          .curtain-actions-grid { gap: 12px; }
          .curtain-btn { padding: 16px; border-radius: 16px; }
          .curtain-btn .btn-icon { font-size: 24px; }
          
          .scheduler-card { padding: 16px; }
          .day-selector { overflow-x: auto; padding-bottom: 8px; }
          .day-check span { width: 28px; height: 28px; font-size: 11px; }
        }

        .toast-notification {
          position: fixed;
          bottom: 32px;
          left: 50%;
          transform: translateX(-50%);
          background: #1e293b;
          color: white;
          padding: 12px 24px;
          border-radius: 100px;
          font-weight: 600;
          font-size: 14px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          z-index: 2000;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid rgba(255,255,255,0.1);
        }

        .metrics-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
        .metric-item { 
          background: var(--bg-card); padding: 16px; border-radius: 16px; 
          border: 1px solid var(--border); display: flex; flex-direction: column; gap: 8px; 
        }
        .metric-item.highlight { background: #f0f9ff; border: 1px solid #bae6fd; padding: 18px 14px; }
        .metric-item .label { font-size: 10px; font-weight: 800; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; white-space: nowrap; }
        .metric-item .value { font-size: 18px; font-weight: 800; color: var(--text-main); }
        .metric-item.highlight .value { color: var(--primary); font-size: 22px; }

        .scheduler-card { margin-top: 24px; }
        .schedule-list { margin: 16px 0; display: flex; flex-direction: column; gap: 10px; }
        .schedule-item { background: var(--bg-card); padding: 12px 16px; border-radius: 12px; border: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; }
        .schedule-info { display: flex; align-items: center; gap: 12px; }
        .schedule-info .time { font-weight: 700; font-size: 16px; }
        .action-badge { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; text-transform: uppercase; }
        .action-badge.on { background: #dcfce7; color: #166534; }
        .action-badge.off { background: #fee2e2; color: #dc2626; }
        .delete-schedule { background: none; color: #94a3b8; font-size: 20px; font-weight: 300; transition: var(--transition); }
        .delete-schedule:hover { color: #dc2626; }
        .add-schedule-form { display: flex; gap: 8px; margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--border); }
        .add-schedule-form input, .add-schedule-form select { flex: 1; padding: 8px; border-radius: 8px; border: 1px solid var(--border); font-size: 13px; font-weight: 600; }
        .add-schedule-form button { padding: 8px 16px; background: var(--primary); color: white; border-radius: 8px; font-weight: 700; transition: var(--transition); }
        .add-schedule-form button:hover { transform: translateY(-2px); }
        .empty-msg { font-size: 13px; color: var(--text-muted); text-align: center; font-style: italic; }

        .schedule-item.range { flex-direction: column; align-items: stretch; gap: 12px; position: relative; }
        .schedule-item.range .delete-schedule { position: absolute; top: 8px; right: 12px; }
        .time-range { display: flex; align-items: center; gap: 8px; }
        .time-range .label { font-size: 11px; color: var(--text-muted); font-weight: 700; }
        .day-badges { display: flex; gap: 6px; }
        .day-dot { width: 22px; height: 22px; display: flex; align-items: center; justify-content: center; border-radius: 50%; background: var(--bg-tertiary); font-size: 10px; font-weight: 700; color: #94a3b8; }
        .day-dot.active { background: var(--primary); color: white; }

        .mode-badge { font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 4px; margin-right: 8px; }
        .mode-badge.on { background: #dcfce7; color: #166534; }
        .mode-badge.off { background: #fee2e2; color: #dc2626; }

        .day-selector-header { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
        .day-selector-header label { font-size: 11px; font-weight: 700; color: var(--text-muted); }
        .toggle-all-btn { font-size: 11px; font-weight: 700; color: var(--primary); background: none; transition: var(--transition); }
        .toggle-all-btn:hover { text-decoration: underline; }

        .add-schedule-form.advanced { flex-direction: column; gap: 16px; }
        .form-row { display: flex; gap: 12px; }
        .input-group { flex: 1; display: flex; flex-direction: column; gap: 4px; }
        .input-group label { font-size: 11px; font-weight: 700; color: var(--text-muted); }
        .day-selector { display: flex; justify-content: space-between; padding: 8px 0; }
        .day-check { cursor: pointer; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .day-check input { display: none; }
        .day-check span { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border-radius: 50%; border: 1px solid var(--border); font-size: 12px; font-weight: 700; transition: var(--transition); }
        .day-check input:checked + span { background: var(--primary); color: white; border-color: var(--primary); }
        .add-btn { width: 100%; padding: 12px; background: var(--primary); color: white; border-radius: 12px; font-weight: 700; }

        .curtain-actions-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
        .curtain-btn { 
          display: flex; 
          flex-direction: column; 
          align-items: center; 
          gap: 12px; 
          padding: 24px; 
          border-radius: 24px; 
          border: 1px solid var(--border); 
          background: var(--bg-card); 
          transition: var(--transition); 
          user-select: none;
          cursor: pointer;
        }
        .curtain-btn .btn-icon { font-size: 32px; }
        .curtain-btn .btn-text { font-size: 11px; font-weight: 800; color: var(--text-muted); }
        .curtain-btn:active { transform: scale(0.95); box-shadow: inset 0 3px 10px rgba(0,0,0,0.1); }
        
        .curtain-btn.open-btn:active { background: rgba(14, 165, 233, 0.15); border-color: #0ea5e9; }
        .curtain-btn.close-btn:active { background: var(--bg-tertiary); border-color: #64748b; }
        .curtain-btn.open-btn:active .btn-text { color: #0ea5e9; }
        .curtain-btn.close-btn:active .btn-text { color: #64748b; }

        /* Three Phase Monitor Styles */
        .three-phase-monitor { background: var(--bg-card); border-radius: 24px; padding: 24px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); }
        .monitor-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; border-bottom: 1px solid var(--border); padding-bottom: 16px; }
        .phase-legend { display: flex; gap: 12px; }
        .phase { font-size: 10px; font-weight: 800; padding: 4px 10px; border-radius: 100px; color: white; text-transform: uppercase; }
        .phase.r { background: #ef4444; }
        .phase.y { background: #eab308; }
        .phase.b { background: #3b82f6; }

        .metrics-table { display: flex; flex-direction: column; gap: 1px; background: var(--border); border-radius: 12px; overflow: hidden; border: 1px solid var(--border); }
        .metrics-row { display: grid; grid-template-columns: 1.5fr 1fr 1fr 1fr; background: var(--bg-card); }
        .metrics-row.header { background: var(--bg-secondary); font-weight: 800; font-size: 11px; text-transform: uppercase; color: var(--text-muted); }
        .metrics-row .col { padding: 16px; display: flex; align-items: center; justify-content: center; font-size: 14px; border-right: 1px solid var(--border); }
        .metrics-row .col:last-child { border-right: none; }
        .metrics-row .col.label { justify-content: flex-start; font-weight: 700; color: var(--text-main); font-size: 13px; }
        .metrics-row .col.val { font-family: 'Courier New', monospace; font-weight: 800; }
        .metrics-row .col.val.r { color: #ef4444; }
        .metrics-row .col.val.y { color: #eab308; }
        .metrics-row .col.val.b { color: #3b82f6; }

        .energy-summary { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; margin-top: 24px; }
        .summary-card { background: var(--bg-secondary); padding: 16px; border-radius: 16px; display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--border); }
        .summary-card.active { background: var(--primary); color: white; border-color: var(--primary); }
        .summary-card .label { font-size: 11px; font-weight: 700; opacity: 0.8; text-transform: uppercase; }
        .summary-card .value { font-size: 20px; font-weight: 800; }
        .summary-card .value small { font-size: 12px; opacity: 0.7; }

        /* Single Phase Monitor Styles */
        .single-phase-monitor { background: var(--bg-card); border-radius: 24px; padding: 24px; border: 1px solid var(--border); box-shadow: var(--shadow-sm); }
        
        .metrics-row-highlights { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 24px; }
        .metric-card.highlight { 
          background: #f8fafc; padding: 16px 12px; border-radius: 16px; 
          border: 1px solid #e2e8f0; display: flex; flex-direction: column; gap: 6px;
          text-align: center;
        }
        .metric-card.highlight.power { background: #f0f9ff; border-color: #bae6fd; }
        .metric-card.highlight .label { font-size: 10px; font-weight: 800; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .metric-card.highlight .value { font-size: 20px; font-weight: 800; color: #1e293b; }
        .metric-card.highlight .value small { font-size: 12px; margin-left: 2px; color: #94a3b8; }
        
        .secondary-metrics-list { margin-top: 24px; background: #f8fafc; border-radius: 20px; padding: 8px; border: 1px solid #f1f5f9; }
        .sec-item { 
          display: flex; justify-content: space-between; align-items: center; 
          padding: 16px 20px; border-bottom: 1px solid #f1f5f9; 
        }
        .sec-item:last-child { border-bottom: none; }
        .sec-item .label { font-size: 12px; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; }
        .sec-item .value { font-size: 16px; font-weight: 800; color: #1e293b; }
        .summary-card.full-width { 
          flex-direction: column; align-items: flex-start; justify-content: center; padding: 32px; 
          background: linear-gradient(135deg, #1e40af, #7c3aed) !important;
          border: none;
          box-shadow: 0 20px 40px rgba(37, 99, 235, 0.25);
          margin-bottom: 32px;
          position: relative;
          overflow: hidden;
          min-height: 160px;
        }
        .card-bg-icon { 
          position: absolute; right: -10px; bottom: -10px; 
          font-size: 120px; opacity: 0.1; transform: rotate(-15deg); 
          pointer-events: none;
        }
        .summary-card.full-width .label { 
          font-size: 14px; font-weight: 700; opacity: 0.8; 
          letter-spacing: 2px; text-transform: uppercase; margin-bottom: 12px;
        }
        .value-container { display: flex; align-items: baseline; gap: 8px; }
        .summary-card.full-width .value { font-size: 52px; font-weight: 900; letter-spacing: -2px; line-height: 1; }
        .summary-card.full-width .unit { font-size: 18px; font-weight: 700; opacity: 0.7; }
        .energy-summary.single { display: block; margin-top: 0; }
        .status-badge.online { background: #dcfce7; color: #166534; font-size: 10px; font-weight: 800; padding: 4px 12px; border-radius: 100px; text-transform: uppercase; }

        /* Touch Panel Controls */
        .touch-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; margin-top: 20px; }
        .touch-item { background: var(--bg-secondary); border-radius: 20px; padding: 20px; border: 1px solid var(--border); transition: var(--transition); }
        .touch-item.active { border-color: var(--primary); background: var(--bg-card); box-shadow: var(--shadow-sm); }
        .touch-item-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
        .touch-item .icon { font-size: 24px; }
        .touch-item-body { display: flex; flex-direction: column; }
        .touch-item .label { font-weight: 700; font-size: 15px; color: var(--text-main); margin-bottom: 2px; }
        .touch-item .status { font-size: 11px; color: var(--text-muted); font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; }
        
        .sub-power-btn { 
          width: 40px; height: 40px; border-radius: 12px; 
          background: var(--bg-tertiary); color: var(--text-muted); 
          display: flex; align-items: center; justify-content: center; 
          transition: var(--transition); border: 1px solid var(--border);
        }
        .sub-power-btn.active { 
          background: var(--primary); color: white; 
          border-color: var(--primary); 
          box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3); 
        }
        .sub-power-btn:active { transform: scale(0.9); }

        .master-off-btn { 
          padding: 8px 16px; border-radius: 100px; 
          background: #fee2e2; color: #ef4444; 
          font-size: 11px; font-weight: 800; 
          border: 1px solid #fecaca; transition: var(--transition);
          text-transform: uppercase;
        }
        .master-off-btn:hover { background: #ef4444; color: white; border-color: #ef4444; }

        .fan-controls { margin-top: 16px; padding-top: 16px; border-top: 1px dashed var(--border); }
        .speed-selector { display: flex; gap: 6px; justify-content: space-between; }
        .speed-btn { 
          flex: 1; height: 32px; border-radius: 8px; 
          background: var(--bg-tertiary); font-size: 11px; 
          font-weight: 800; color: var(--text-muted); 
          transition: var(--transition);
        }
        .speed-btn.active { background: var(--text-main); color: var(--bg-card); }
        .speed-btn:hover:not(.active) { background: var(--border); }



      `}</style>
    </div>
  );
};

export default App;
