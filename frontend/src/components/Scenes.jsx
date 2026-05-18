import React, { useState, useEffect, useCallback } from 'react';
import { 
  Plus, ChevronLeft, Home, Globe, Trash2, Edit3, 
  Thermometer, Droplets, Sun, Footprints, Radio, 
  Settings, Power, Play, X, CheckCircle2, AlertCircle
} from 'lucide-react';
import './Scenes.css';
import AddRoomModal from './AddRoomModal';

const API_BASE = `http://${window.location.hostname}:3000`;
const API_AUTOMATIONS = `${API_BASE}/api/automations`;
const API_SENSORS = `${API_BASE}/api/sensors`;

const OPS = { gt: '>', lt: '<', eq: '=', gte: '≥', lte: '≤', neq: '≠' };
const ICONS = [
  { id: 'zap', icon: <Power size={20} />, label: '⚡' },
  { id: 'temp', icon: <Thermometer size={20} />, label: '🌡️' },
  { id: 'light', icon: <Sun size={20} />, label: '💡' },
  { id: 'home', icon: <Home size={20} />, label: '🏠' },
  { id: 'notif', icon: <AlertCircle size={20} />, label: '🔔' }
];

const EMPTY_COND = { sensor: 'temperature', operator: 'gt', value: 30 };
const EMPTY_ACTION = { targetDeviceId: '', targetDevice: '', command: 'turn_on', subDeviceIndex: null, params: {} };

const DEVICE_COMMANDS = {
  light: ['turn_on', 'turn_off', 'set_brightness', 'set_color', 'set_effect'],
  rgbw: ['turn_on', 'turn_off', 'set_brightness', 'set_color'],
  fan: ['turn_on', 'turn_off', 'set_speed'],
  switch: ['turn_on', 'turn_off'],
  plug: ['turn_on', 'turn_off'],
  curtain: ['turn_on', 'turn_off'],
  'touch-panel': ['turn_on', 'turn_off', 'set_speed'],
  default: ['turn_on', 'turn_off']
};

const hexToRgb = (hex) => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
    255 
  ] : [255, 255, 255, 255];
};

const rgbToHex = (rgb) => {
  if (!Array.isArray(rgb) || rgb.length < 3) return '#ffffff';
  return "#" + ((1 << 24) + (rgb[0] << 16) + (rgb[1] << 8) + rgb[2]).toString(16).slice(1);
};

const Scenes = ({ socket, rooms, allDevices, onAddRoom }) => {
  const [rules, setRules] = useState([]);
  const [sensorData, setSensorData] = useState({ temperature: 25, humidity: 50, lux: 0, motion: false });
  const [availableSensors, setAvailableSensors] = useState(['temperature', 'humidity', 'lux', 'motion']);
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState(null);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [currentRoom, setCurrentRoom] = useState(null);

  const [form, setForm] = useState({
    name: '', description: '', icon: '⚡', room: 'Global', conditionLogic: 'all', cooldownSeconds: 60,
    conditions: [{ ...EMPTY_COND }],
    actions: [{ ...EMPTY_ACTION }],
  });

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const fetchRules = useCallback(async () => {
    try {
      const res = await fetch(API_AUTOMATIONS);
      const data = await res.json();
      setRules(Array.isArray(data) ? data : []);
    } catch (e) { console.error('Fetch error:', e); }
  }, []);

  const fetchCustomSensors = useCallback(async () => {
    try {
      const res = await fetch(API_SENSORS);
      const data = await res.json();
      const customNames = (Array.isArray(data) ? data : []).map(s => s.name);
      setAvailableSensors(['temperature', 'humidity', 'lux', 'motion', ...customNames]);
    } catch (e) { console.error('Fetch sensors error:', e); }
  }, []);

  useEffect(() => {
    fetchRules();
    fetchCustomSensors();
  }, [fetchRules, fetchCustomSensors]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => setSensorData(data);
    const triggerHandler = (data) => {
      showToast(data.ruleName);
      fetchRules();
    };
    socket.on('sensor_data_update', handler);
    socket.on('automation_triggered', triggerHandler);
    socket.emit('get_sensor_data');
    return () => {
      socket.off('sensor_data_update', handler);
      socket.off('automation_triggered', triggerHandler);
    };
  }, [socket, fetchRules]);

  const openCreate = () => {
    setEditId(null);
    setForm({
      name: '',
      description: '',
      icon: '⚡',
      room: currentRoom ? currentRoom.name : 'Global',
      conditionLogic: 'all',
      cooldownSeconds: 60,
      conditions: [{ ...EMPTY_COND }],
      actions: [{ ...EMPTY_ACTION }]
    });
    setShowModal(true);
  };

  const openEdit = (rule) => {
    setEditId(rule._id);
    setForm({
      name: rule.name,
      description: rule.description || '',
      icon: rule.icon || '⚡',
      room: rule.room || 'Global',
      conditionLogic: rule.conditionLogic,
      cooldownSeconds: rule.cooldownSeconds,
      conditions: rule.conditions.map(c => ({ ...c })),
      actions: rule.actions.map(a => ({ ...a }))
    });
    setShowModal(true);
  };

  const saveRule = async () => {
    if (!form.name.trim()) return showToast('⚠️ Rule name is required');
    try {
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `${API_AUTOMATIONS}/${editId}` : API_AUTOMATIONS;
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        setShowModal(false);
        fetchRules();
        showToast(editId ? 'Updated' : 'Created');
      }
    } catch (e) { showToast('Error saving'); }
  };

  const toggleRule = async (id) => {
    await fetch(`${API_AUTOMATIONS}/${id}/toggle`, { method: 'PATCH' });
    fetchRules();
  };

  const deleteRule = async (id) => {
    if (!window.confirm('Delete automation?')) return;
    await fetch(`${API_AUTOMATIONS}/${id}`, { method: 'DELETE' });
    fetchRules();
    showToast('Deleted');
  };

  const handleAddRoomLocal = async (roomData) => {
    if (onAddRoom) {
      await onAddRoom(roomData);
      showToast('Room added');
    }
  };

  const updateCond = (i, field, val) => {
    const c = [...form.conditions];
    if (field === 'sensor' && val === 'motion') c[i].value = "1";
    c[i] = { ...c[i], [field]: val };
    setForm({ ...form, conditions: c });
  };

  const addCond = () => setForm({ ...form, conditions: [...form.conditions, { ...EMPTY_COND }] });
  const removeCond = (i) => {
    if (form.conditions.length > 1) {
      const c = [...form.conditions];
      c.splice(i, 1);
      setForm({ ...form, conditions: c });
    }
  };

  const updateAction = (i, field, val) => {
    const a = [...form.actions];
    if (field === 'targetDeviceId') {
      const dev = allDevices.find(d => d.deviceId === val);
      a[i] = { ...a[i], targetDeviceId: val, targetDevice: dev ? dev.title : '', subDeviceIndex: null, command: 'turn_on', params: {} };
    } else if (field === 'command') {
      a[i] = { ...a[i], command: val, params: {} };
    } else {
      a[i] = { ...a[i], [field]: val };
    }
    setForm({ ...form, actions: a });
  };

  const addAction = () => setForm({ ...form, actions: [...form.actions, { ...EMPTY_ACTION }] });
  const removeAction = (i) => {
    if (form.actions.length > 1) {
      const a = [...form.actions];
      a.splice(i, 1);
      setForm({ ...form, actions: a });
    }
  };

  const fmtCmd = (c, deviceId) => {
    const dev = allDevices?.find(d => d.deviceId === deviceId);
    if (dev?.type === 'curtain') {
      if (c === 'turn_on') return 'Open';
      if (c === 'turn_off') return 'Close';
    }
    return c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div className="scenes-view animate-slide-up">
      <div className="scenes-header">
        <div>
          <h1>{currentRoom ? currentRoom.name : 'Automations'}</h1>
          <p>{currentRoom ? `Rules for ${currentRoom.name}` : 'Select a room to manage rules'}</p>
        </div>
        <div className="header-actions">
          {currentRoom && (
            <button className="action-btn-pill secondary" onClick={() => setCurrentRoom(null)}>
              <ChevronLeft size={16} /> All Rooms
            </button>
          )}
          {!currentRoom && (
            <button className="action-btn-pill primary" onClick={() => setIsRoomModalOpen(true)}>
              <Plus size={16} /> Add Room
            </button>
          )}
        </div>
      </div>

      {currentRoom && (
        <div className="sensor-bar">
          <div className="sensor-chip">
            <span className="icon"><Thermometer size={20} /></span>
            <div className="info"><span className="label">Temp</span><span className="val">{sensorData.temperature}°C</span></div>
          </div>
          <div className="sensor-chip">
            <span className="icon"><Droplets size={20} /></span>
            <div className="info"><span className="label">Humidity</span><span className="val">{sensorData.humidity}%</span></div>
          </div>
          <div className="sensor-chip">
            <span className="icon"><Sun size={20} /></span>
            <div className="info"><span className="label">Lux</span><span className="val">{sensorData.lux} lx</span></div>
          </div>
          <div className="sensor-chip">
            <span className="icon"><Footprints size={20} /></span>
            <div className="info"><span className="label">Motion</span><span className="val">{sensorData.motion ? 'Active' : 'None'}</span></div>
          </div>
        </div>
      )}

      {!currentRoom ? (
        <div className="rooms-grid-scene">
          {(Array.isArray(rooms) ? rooms : []).map(room => {
            const roomRules = (Array.isArray(rules) ? rules : []).filter(r => r.room === room.name);
            const activeRules = roomRules.filter(r => r.enabled).length;
            return (
              <div key={room.name} className="room-card-scene glass" onClick={() => setCurrentRoom(room)}>
                <div className="room-card-header-scene">
                  <span className="room-icon-scene"><Home size={24} /></span>
                  <div className={`active-badge-scene ${activeRules > 0 ? 'active' : ''}`}>{activeRules} Active</div>
                </div>
                <div className="room-card-body-scene">
                  <h3>{room.name}</h3>
                  <p>{roomRules.length} Rules</p>
                </div>
              </div>
            );
          })}
          <div className="room-card-scene global glass" onClick={() => setCurrentRoom({ name: 'Global', icon: '🌍' })}>
            <div className="room-card-header-scene">
              <span className="room-icon-scene"><Globe size={24} /></span>
              <div className="active-badge-scene">{(Array.isArray(rules) ? rules : []).filter(r => (r.room === 'Global' || !r.room) && r.enabled).length} Active</div>
            </div>
            <div className="room-card-body-scene">
              <h3>Global System</h3>
              <p>{(Array.isArray(rules) ? rules : []).filter(r => r.room === 'Global' || !r.room).length} Rules</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rules-grid-container">
          <div className="welcome-header">
            <button className="action-btn-pill primary" onClick={openCreate}><Plus size={16} /> New Rule</button>
          </div>
          <div className="rules-grid">
            {(Array.isArray(rules) ? rules : []).filter(r => (r.room === 'Global' || (currentRoom && r.room === currentRoom.name))).map(rule => (
              <div className={`rule-card glass ${rule.enabled ? '' : 'disabled'}`} key={rule._id}>
                <div className="card-top">
                  <div className="card-icon"><Radio size={24} /></div>
                  <div className="card-actions">
                    <button className="action-btn-scene" onClick={() => openEdit(rule)}><Edit3 size={14} /></button>
                    <button className="action-btn-scene delete" onClick={() => deleteRule(rule._id)}><Trash2 size={14} /></button>
                  </div>
                </div>
                <h3>{rule.name}</h3>
                <p className="desc">{rule.description || 'No description provided'}</p>
                <div className="conditions-list">
                  {rule.conditions.map((c, i) => (
                    <span className="cond-pill" key={i}>IF {c.sensor} {OPS[c.operator]} {String(c.value)}</span>
                  ))}
                  {rule.actions.map((a, i) => (
                    <span className="action-pill" key={i}>THEN {fmtCmd(a.command, a.targetDeviceId)} {a.targetDevice}</span>
                  ))}
                </div>
                <div className="card-footer-scene">
                  <span className="trigger-info">{rule.triggerCount || 0} Runs</span>
                  <button className={`toggle-switch ${rule.enabled ? 'on' : ''}`} onClick={() => toggleRule(rule._id)}>
                    <span className="knob"></span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal glass scene-modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? 'Edit Rule' : 'New Rule'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <div className="modal-body">
              <div className="setup-section">
                <h3>1. Details</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Name</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Enter name..." />
                  </div>
                  <div className="form-group">
                    <label>Cooldown (sec)</label>
                    <input type="number" value={form.cooldownSeconds} onChange={e => setForm({ ...form, cooldownSeconds: Number(e.target.value) })} />
                  </div>
                </div>
              </div>

              <div className="setup-section">
                <div className="setup-header">
                  <h3>2. Conditions</h3>
                  <button className="add-btn-small" onClick={addCond}>+ Add</button>
                </div>
                <div className="items-list">
                  {form.conditions.map((c, i) => (
                    <div className="item-card" key={i}>
                      <div className="item-controls">
                        <select value={c.sensor} onChange={e => updateCond(i, 'sensor', e.target.value)}>
                          {availableSensors.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={c.operator} onChange={e => updateCond(i, 'operator', e.target.value)}>
                          {Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <input type="number" value={c.value} onChange={e => updateCond(i, 'value', e.target.value)} />
                      </div>
                      <button className="remove-btn" onClick={() => removeCond(i)}><X size={14} /></button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="setup-section">
                <div className="setup-header">
                  <h3>3. Actions</h3>
                  <button className="add-btn-small" onClick={addAction}>+ Add</button>
                </div>
                <div className="items-list">
                  {form.actions.map((a, i) => {
                    const dev = allDevices.find(d => d.deviceId === a.targetDeviceId);
                    const type = dev ? (dev.deviceId.startsWith('BSQ') ? 'touch-panel' : dev.type) : 'default';
                    const cmds = DEVICE_COMMANDS[type] || DEVICE_COMMANDS.default;

                    return (
                      <div className="item-card" key={i}>
                        <div className="action-main">
                          <select value={a.targetDeviceId} onChange={e => updateAction(i, 'targetDeviceId', e.target.value)}>
                            <option value="">Device</option>
                            {(Array.isArray(allDevices) ? allDevices : []).map(d => <option key={d.deviceId} value={d.deviceId}>{d.title}</option>)}
                          </select>
                          <select value={a.command} onChange={e => updateAction(i, 'command', e.target.value)}>
                            {cmds.map(c => <option key={c} value={c}>{fmtCmd(c, a.targetDeviceId)}</option>)}
                          </select>
                        </div>
                        <button className="remove-btn" onClick={() => removeAction(i)}><X size={14} /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="action-btn-pill primary" onClick={saveRule}>Save Automation</button>
            </div>
          </div>
        </div>
      )}
      <AddRoomModal isOpen={isRoomModalOpen} onClose={() => setIsRoomModalOpen(false)} onAdd={handleAddRoomLocal} />
      {toast && <div className="toast"><span>⚡</span> {toast}</div>}
    </div>
  );
};

export default Scenes;
