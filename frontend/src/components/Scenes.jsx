import React, { useState, useEffect, useCallback } from 'react';
import './Scenes.css';
import AddRoomModal from './AddRoomModal';

const API_BASE = `http://${window.location.hostname}:3000`;
const API_AUTOMATIONS = `${API_BASE}/api/automations`;
const SENSORS = ['temperature', 'humidity', 'lux', 'motion'];
const OPS = { gt: '>', lt: '<', eq: '=', gte: '≥', lte: '≤', neq: '≠' };
const ICONS = ['⚡', '🌡️', '💡', '❄️', '🔒', '🌙', '☀️', '🎬', '🔔', '🏠'];

const EMPTY_COND = { sensor: 'temperature', operator: 'gt', value: 30 };
const EMPTY_ACTION = { targetDeviceId: '', targetDevice: '', command: 'turn_on', subDeviceIndex: null, params: {} };

const DEVICE_COMMANDS = {
  light: ['turn_on', 'turn_off', 'set_brightness', 'set_color', 'set_effect'],
  rgbw: ['turn_on', 'turn_off', 'set_brightness', 'set_color'],
  fan: ['turn_on', 'turn_off', 'set_speed'],
  switch: ['turn_on', 'turn_off'],
  plug: ['turn_on', 'turn_off'],
  'touch-panel': ['turn_on', 'turn_off', 'set_speed'],
  default: ['turn_on', 'turn_off']
};

const Scenes = ({ socket, rooms, allDevices, onAddRoom }) => {
  const [rules, setRules] = useState([]);
  const [sensorData, setSensorData] = useState({ temperature: 25, humidity: 50, lux: 0, motion: false });
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState(null);
  const [showSim, setShowSim] = useState(false);
  const [simValues, setSimValues] = useState({ temperature: 25, humidity: 50, lux: 100, motion: 0 });
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
      setRules(data);
    } catch (e) { console.error('Fetch error:', e); }
  }, []);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  useEffect(() => {
    if (!socket) return;
    const handler = (data) => setSensorData(data);
    const triggerHandler = (data) => {
      showToast(`⚡ "${data.ruleName}" triggered!`);
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
    if (!form.name.trim()) return showToast('⚠️ Please enter a rule name');
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
        showToast(editId ? '✅ Rule updated!' : '✅ Rule created!');
      } else {
        showToast('❌ Save failed');
      }
    } catch (e) { showToast('❌ Save failed'); }
  };

  const toggleRule = async (id) => {
    await fetch(`${API_AUTOMATIONS}/${id}/toggle`, { method: 'PATCH' });
    fetchRules();
  };

  const deleteRule = async (id) => {
    if (!window.confirm('Delete this automation?')) return;
    await fetch(`${API_AUTOMATIONS}/${id}`, { method: 'DELETE' });
    fetchRules();
    showToast('🗑️ Rule deleted');
  };

  const handleAddRoomLocal = async (roomData) => {
    if (onAddRoom) {
      await onAddRoom(roomData);
      showToast('🏠 Room created successfully!');
    }
  };

  const simulate = () => {
    if (!socket) return;
    socket.emit('simulate_sensor', {
      temperature: Number(simValues.temperature),
      humidity: Number(simValues.humidity),
      lux: Number(simValues.lux),
      motion: Number(simValues.motion) > 0,
    });
    showToast('🧪 Sensor data simulated!');
  };

  const updateCond = (i, field, val) => {
    const c = [...form.conditions];
    if (field === 'sensor' && val === 'motion') {
      c[i].value = "1";
    }
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
      a[i] = {
        ...a[i],
        targetDeviceId: val,
        targetDevice: dev ? dev.title : '',
        subDeviceIndex: null,
        command: 'turn_on',
        params: {}
      };
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

  const fmtCmd = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="scenes-view animate-slide-up">
      <div className="scenes-header">
        <div>
          <h1>{currentRoom ? `${currentRoom.name} Automations` : 'Automations'}</h1>
          <p>{currentRoom ? `Managing rules for ${currentRoom.name}` : 'Select a room to manage its automation rules'}</p>
        </div>
        <div className="header-actions">
          {currentRoom && (
            <button className="back-link-scene" onClick={() => setCurrentRoom(null)}>← All Rooms</button>
          )}
          {!currentRoom && (
            <button className="add-room-btn-scene" onClick={() => setIsRoomModalOpen(true)}>＋ 🏠 Add Room</button>
          )}
        </div>
      </div>

      {currentRoom && (
        <>
          <div className="sensor-bar">
            <div className="sensor-chip"><span className="icon">🌡️</span><div className="info"><span className="label">Temp</span><span className="val">{sensorData.temperature}°C</span></div></div>
            <div className="sensor-chip"><span className="icon">💧</span><div className="info"><span className="label">Humidity</span><span className="val">{sensorData.humidity}%</span></div></div>
            <div className="sensor-chip"><span className="icon">☀️</span><div className="info"><span className="label">Lux</span><span className="val">{sensorData.lux} lx</span></div></div>
            <div className="sensor-chip"><span className="icon">🚶</span><div className="info"><span className="label">Motion</span><span className="val">{sensorData.motion ? 'Active' : 'None'}</span></div></div>
          </div>
          <div style={{ marginBottom: 24 }}>
            <button className="create-btn" onClick={() => setShowSim(!showSim)}>🧪 {showSim ? 'Hide' : 'Show'} Simulator</button>
          </div>
        </>
      )}

      {showSim && (
        <div className="sim-panel animate-fade-in">
          <h3>🧪 Live Simulator</h3>
          <div className="sim-controls">
            {['temperature', 'humidity', 'lux', 'motion'].map(s => (
              <div className="sim-field" key={s}>
                <label>{s}</label>
                <input type="number" value={simValues[s]} onChange={e => setSimValues({ ...simValues, [s]: e.target.value })} />
              </div>
            ))}
          </div>
          <button className="sim-btn" onClick={simulate}>Run Test</button>
        </div>
      )}

      {!currentRoom ? (
        <div className="rooms-grid-scene">
          {rooms.map(room => {
            const roomRules = rules.filter(r => r.room === room.name);
            const activeRules = roomRules.filter(r => r.enabled).length;
            return (
              <div key={room.name} className="room-card-scene glass card-hover" onClick={() => setCurrentRoom(room)}>
                <div className="room-card-header-scene">
                  <span className="room-icon-scene">{room.icon}</span>
                  <div className={`active-badge-scene ${activeRules > 0 ? 'active' : ''}`}>{activeRules} Active</div>
                </div>
                <div className="room-card-body-scene">
                  <h3>{room.name}</h3>
                  <p>{roomRules.length} Automations</p>
                </div>
              </div>
            );
          })}
          <div className="room-card-scene global glass card-hover" onClick={() => setCurrentRoom({ name: 'Global', icon: '🌍' })}>
            <div className="room-card-header-scene">
              <span className="room-icon-scene">🌍</span>
              <div className="active-badge-scene">{rules.filter(r => (r.room === 'Global' || !r.room) && r.enabled).length} Active</div>
            </div>
            <div className="room-card-body-scene">
              <h3>Global System</h3>
              <p>{rules.filter(r => r.room === 'Global' || !r.room).length} Automations</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="rules-grid-container animate-slide-up">
          <button className="create-btn" onClick={openCreate}>＋ New Rule</button>
          <div className="rules-grid">
            {rules.filter(r => (r.room === 'Global' || (currentRoom && r.room === currentRoom.name))).map(rule => (
              <div className={`rule-card glass ${rule.enabled ? '' : 'disabled'}`} key={rule._id}>
                <div className="card-top">
                  <div className="card-icon">{rule.icon || '⚡'}</div>
                  <div className="card-actions">
                    <button className="action-btn" onClick={() => openEdit(rule)}>✏️</button>
                    <button className="action-btn delete" onClick={() => deleteRule(rule._id)}>🗑️</button>
                  </div>
                </div>
                <h3>{rule.name}</h3>
                <p className="desc">{rule.description}</p>
                <div className="conditions-list">
                  {rule.conditions.map((c, i) => (
                    <span className="cond-pill" key={i}>IF {c.sensor} {OPS[c.operator]} {String(c.value)}</span>
                  ))}
                </div>
                <div className="conditions-list">
                  {rule.actions.map((a, i) => (
                    <span className="action-pill" key={i}>→ {fmtCmd(a.command)} {a.targetDevice}</span>
                  ))}
                </div>
                <div className="card-footer">
                   <span className="trigger-info">
                    {rule.triggerCount > 0 ? `${rule.triggerCount} Triggers` : 'Never Run'}
                  </span>
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
          <div className="modal glass animate-slide-up" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? 'Edit Automation' : 'New Rule'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="setup-section">
                <h3>1. Information</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label>Name</label>
                    <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Rule Name" />
                  </div>
                  <div className="form-group">
                    <label>Icon</label>
                    <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}>
                      {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                    </select>
                  </div>
                </div>
                {!currentRoom && (
                  <div className="form-group">
                    <label>Room</label>
                    <select value={form.room} onChange={e => setForm({ ...form, room: e.target.value })}>
                      <option value="Global">Global</option>
                      {rooms.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                    </select>
                  </div>
                )}
              </div>

              <div className="setup-section">
                <div className="setup-header">
                  <h3>2. Conditions</h3>
                  <button className="add-btn-small" onClick={addCond}>+ Add</button>
                </div>
                <div className="logic-config">
                   <label>Execute if</label>
                   <select value={form.conditionLogic} onChange={e => setForm({ ...form, conditionLogic: e.target.value })}>
                     <option value="all">ALL match</option>
                     <option value="any">ANY match</option>
                   </select>
                </div>
                <div className="items-list">
                  {form.conditions.map((c, i) => (
                    <div className="item-card" key={i}>
                      <div className="item-controls">
                        <select value={c.sensor} onChange={e => updateCond(i, 'sensor', e.target.value)}>
                          {SENSORS.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <select value={c.operator} onChange={e => updateCond(i, 'operator', e.target.value)}>
                          {Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                        <input type="number" value={c.value} onChange={e => updateCond(i, 'value', e.target.value)} />
                      </div>
                      <button className="remove-btn" onClick={() => removeCond(i)}>✕</button>
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
                            <option value="">Select Device</option>
                            {allDevices.map(d => <option key={d.deviceId} value={d.deviceId}>{d.title}</option>)}
                          </select>
                          {type === 'touch-panel' && dev.subDevices && (
                            <select value={a.subDeviceIndex || 0} onChange={e => updateAction(i, 'subDeviceIndex', Number(e.target.value))}>
                              {dev.subDevices.map((sd, idx) => <option key={idx} value={idx}>{sd.label || `Switch ${idx + 1}`}</option>)}
                            </select>
                          )}
                          <select value={a.command} onChange={e => updateAction(i, 'command', e.target.value)}>
                            {cmds.map(c => <option key={c} value={c}>{fmtCmd(c)}</option>)}
                          </select>
                        </div>
                        {a.command === 'set_speed' && (
                           <div className="param-box">
                             <label>Speed: {a.params?.speed || 1}</label>
                             <input type="range" min="1" max="5" value={a.params?.speed || 1} onChange={e => updateAction(i, 'params', { ...a.params, speed: Number(e.target.value) })} />
                           </div>
                        )}
                         {a.command === 'set_brightness' && (
                           <div className="param-box">
                             <label>Brightness: {Math.round(((a.params?.brightness || 255) / 255) * 100)}%</label>
                             <input type="range" min="0" max="255" value={a.params?.brightness || 255} onChange={e => updateAction(i, 'params', { ...a.params, brightness: Number(e.target.value) })} />
                           </div>
                        )}
                        <button className="remove-btn" onClick={() => removeAction(i)}>✕</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="setup-section settings">
                <div className="cooldown-row">
                  <label>Cooldown (sec)</label>
                  <input type="number" value={form.cooldownSeconds} onChange={e => setForm({ ...form, cooldownSeconds: Number(e.target.value) })} />
                </div>
                <label className="global-toggle">
                  <input type="checkbox" checked={form.room === 'Global'} onChange={e => setForm({ ...form, room: e.target.checked ? 'Global' : (currentRoom?.name || 'Global') })} />
                  <span>🌍 Apply to all rooms</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="save-btn" onClick={saveRule}>Save Rule</button>
            </div>
          </div>
        </div>
      )}
      <AddRoomModal isOpen={isRoomModalOpen} onClose={() => setIsRoomModalOpen(false)} onAdd={handleAddRoomLocal} />
    </div>
  );
};

export default Scenes;
