 import React, { useState, useEffect, useCallback } from 'react';
 import './Scenes.css';
 import AddRoomModal from './AddRoomModal';


const API = 'http://localhost:3000/api/automations';
const SENSORS = ['temperature', 'humidity', 'lux', 'motion'];
const OPS = { gt: '>', lt: '<', eq: '=', gte: '≥', lte: '≤', neq: '≠' };
const COMMANDS = ['turn_on', 'turn_off', 'set_brightness', 'set_color', 'set_effect'];
 const ICONS = ['⚡', '🌡️', '💡', '❄️', '🔒', '🌙', '☀️', '🎬', '🔔', '🏠'];

const EMPTY_COND = { sensor: 'temperature', operator: 'gt', value: 30 };
const EMPTY_ACTION = { targetDevice: 'Air Conditioner', command: 'turn_on', params: {} };

const Scenes = ({ socket }) => {
  const [rules, setRules] = useState([]);
  const [sensorData, setSensorData] = useState({ temperature: 25, humidity: 50, lux: 0, motion: false });
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState(null);
  const [toast, setToast] = useState(null);
   const [showSim, setShowSim] = useState(false);
   const [simValues, setSimValues] = useState({ temperature: 25, humidity: 50, lux: 100, motion: 0 });
   const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
   const [currentRoom, setCurrentRoom] = useState(null);
   const [rooms, setRooms] = useState([]);
   const [allDevices, setAllDevices] = useState([]);

 
   // Form state
   const [form, setForm] = useState({
     name: '', description: '', icon: '⚡', room: 'Global', conditionLogic: 'all', cooldownSeconds: 60,
     conditions: [{ ...EMPTY_COND }],
     actions: [{ ...EMPTY_ACTION }],
   });


  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

   const fetchRules = useCallback(async () => {
     try {
       const res = await fetch(API);
       const data = await res.json();
       setRules(data);
     } catch (e) { console.error('Fetch error:', e); }
   }, []);
 
   const fetchRooms = useCallback(async () => {
     try {
       const res = await fetch('http://localhost:3000/api/rooms');
       const data = await res.json();
       setRooms(data);
     } catch (err) {
       console.error('Failed to fetch rooms', err);
     }
   }, []);
 
   const fetchAllDevices = useCallback(async () => {
     try {
       const res = await fetch('http://localhost:3000/api/devices');
       const data = await res.json();
       setAllDevices(data.filter(d => d.isConfigured));
     } catch (err) {
       console.error('Failed to fetch devices', err);
     }
   }, []);
 
   useEffect(() => { 
     fetchRules(); 
     fetchRooms();
     fetchAllDevices();
   }, [fetchRules, fetchRooms, fetchAllDevices]);



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
    return () => { socket.off('sensor_data_update', handler); socket.off('automation_triggered', triggerHandler); };
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
       conditions: [...rule.conditions], 
       actions: [...rule.actions] 
     });
     setShowModal(true);
   };


  const saveRule = async () => {
    if (!form.name.trim()) return showToast('⚠️ Please enter a rule name');
    try {
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `${API}/${editId}` : API;
      await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      setShowModal(false);
      fetchRules();
      showToast(editId ? '✅ Rule updated!' : '✅ Rule created!');
    } catch (e) { showToast('❌ Save failed'); }
  };

  const toggleRule = async (id) => {
    await fetch(`${API}/${id}/toggle`, { method: 'PATCH' });
    fetchRules();
  };

  const deleteRule = async (id) => {
    await fetch(`${API}/${id}`, { method: 'DELETE' });
    fetchRules();
    showToast('🗑️ Rule deleted');
  };

  const handleAddRoom = async (roomData) => {
    try {
      const res = await fetch('http://localhost:3000/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(roomData)
       });
       if (res.ok) {
         showToast('🏠 Room created successfully!');
         fetchRooms();
       }

    } catch (err) {
      console.error('Failed to add room', err);
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

  // Form helpers
  const updateCond = (i, field, val) => {
    const c = [...form.conditions]; 
    let newValue = val;
    if (field === 'sensor' && val === 'motion') {
      c[i].value = "1"; // Default to detected for motion
    }
    c[i] = { ...c[i], [field]: newValue }; 
    setForm({ ...form, conditions: c });
  };
  const addCond = () => setForm({ ...form, conditions: [...form.conditions, { ...EMPTY_COND }] });
  const removeCond = (i) => { if (form.conditions.length > 1) { const c = [...form.conditions]; c.splice(i, 1); setForm({ ...form, conditions: c }); }};
  const updateAction = (i, field, val) => {
    const a = [...form.actions]; a[i] = { ...a[i], [field]: val }; setForm({ ...form, actions: a });
  };
  const addAction = () => setForm({ ...form, actions: [...form.actions, { ...EMPTY_ACTION }] });
  const removeAction = (i) => { if (form.actions.length > 1) { const a = [...form.actions]; a.splice(i, 1); setForm({ ...form, actions: a }); }};

  const fmtCmd = (c) => c.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <div className="scenes-view animate-fade-in">
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



      {/* Live Sensor Bar & Simulator - Only show inside a room */}
      {currentRoom && (
        <>
          <div className="sensor-bar">
            <div className="sensor-chip"><span className="icon">🌡️</span><div className="info"><span className="label">Temperature</span><span className="val">{sensorData.temperature}°C</span></div></div>
            <div className="sensor-chip"><span className="icon">💧</span><div className="info"><span className="label">Humidity</span><span className="val">{sensorData.humidity}%</span></div></div>
            <div className="sensor-chip"><span className="icon">☀️</span><div className="info"><span className="label">Light</span><span className="val">{sensorData.lux} lx</span></div></div>
            <div className="sensor-chip"><span className="icon">🚶</span><div className="info"><span className="label">Motion</span><span className="val">{sensorData.motion ? 'Detected' : 'None'}</span></div></div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <button className="add-btn" onClick={() => setShowSim(!showSim)}>🧪 {showSim ? 'Hide' : 'Show'} Sensor Simulator</button>
          </div>
        </>
      )}
      {showSim && (
        <div className="sim-panel animate-fade-in">
          <h3>🧪 Sensor Simulator</h3>
          <div className="sim-controls">
            {['temperature', 'humidity', 'lux', 'motion'].map(s => (
              <div className="sim-field" key={s}>
                <label>{s}</label>
                <input type="number" value={simValues[s]} onChange={e => setSimValues({ ...simValues, [s]: e.target.value })} />
              </div>
            ))}
          </div>
          <button className="sim-btn" onClick={simulate}>🚀 Simulate Now</button>
        </div>
      )}

      {/* Room Selection Grid or Rules Grid */}
       {!currentRoom ? (
         <div className="rooms-grid-scene animate-fade-in">
           {rooms.map(room => {
             const roomRules = rules.filter(r => r.room === room.name);
             const activeRules = roomRules.filter(r => r.enabled).length;
             return (
               <div key={room.name} className="room-card-scene" onClick={() => setCurrentRoom(room)}>
                 <div className="room-card-header-scene">
                   <span className="room-icon-scene">{room.icon}</span>
                   <div className="active-badge-scene">{activeRules} Active</div>
                 </div>
                 <div className="room-card-body-scene">
                   <h3>{room.name}</h3>
                   <p>{roomRules.length} Automations</p>
                 </div>
               </div>
             );
           })}
           {/* Global/Unassigned Card */}
           <div className="room-card-scene global" onClick={() => setCurrentRoom({ name: 'Global', icon: '🌍' })}>
             <div className="room-card-header-scene">
               <span className="room-icon-scene">🌍</span>
               <div className="active-badge-scene">{rules.filter(r => (r.room === 'Global' || !r.room) && r.enabled).length} Active</div>
             </div>
             <div className="room-card-body-scene">
               <h3>Global Rules</h3>
               <p>{rules.filter(r => r.room === 'Global' || !r.room).length} Automations</p>
             </div>
           </div>
         </div>
       ) : rules.filter(r => (r.room === 'Global' || (currentRoom && r.room === currentRoom.name))).length === 0 ? (
         <div className="empty-state">
           <div className="icon">🤖</div>
           <h2>No Automations in {currentRoom.name}</h2>
           <p>Create your first rule to automate this room</p>
           <h2>No Automations</h2>
           <p>Get started by adding a rule to this room</p>
           <button className="create-btn" onClick={openCreate}>＋ Create New Rule</button>
         </div>
       ) : (
         <div className="rules-grid-container">
           <button className="create-btn-inline" onClick={openCreate}>＋ Create New Rule</button>
           <div className="rules-grid">
             {rules
               .filter(rule => (rule.room === 'Global' || (currentRoom && rule.room === currentRoom.name)))
             .map(rule => (
            <div className={`rule-card ${rule.enabled ? '' : 'disabled'}`} key={rule._id}>
              <div className="card-top">
                <div className="card-icon">{rule.icon || '⚡'}</div>
                <div className="card-actions">
                  <button onClick={() => openEdit(rule)} title="Edit">✏️</button>
                  <button className="del-btn" onClick={() => deleteRule(rule._id)} title="Delete">🗑️</button>
                </div>
              </div>
              <h3>{rule.name}</h3>
              {rule.description && <p className="desc">{rule.description}</p>}
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
                  {rule.triggerCount > 0 ? `Triggered ${rule.triggerCount}×` : 'Never triggered'}
                  {rule.room === 'Global' && <span className="global-tag"> • Global</span>}
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

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{editId ? 'Edit Rule' : 'New Automation Rule'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Rule Name</label>
                  <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Cool Down Room" />
                </div>
                <div className="form-group">
                  <label>Icon</label>
                  <select value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })}>
                    {ICONS.map(ic => <option key={ic} value={ic}>{ic}</option>)}
                  </select>
                </div>
              </div>
               <div className="form-group">
                 <label>Description (optional)</label>
                 <input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What does this rule do?" />
               </div>
               
               {!currentRoom && (
                 <div className="form-group">
                   <label>Assign to Room</label>
                   <select 
                     value={form.room} 
                     onChange={e => setForm({ ...form, room: e.target.value })}
                   >
                     <option value="Global">Global / All Rooms</option>
                     {rooms.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                   </select>
                 </div>
               )}

              <div className="form-row">
                <div className="form-group">
                  <label>Logic</label>
                  <select value={form.conditionLogic} onChange={e => setForm({ ...form, conditionLogic: e.target.value })}>
                    <option value="all">ALL conditions (AND)</option>
                    <option value="any">ANY condition (OR)</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Cooldown (seconds)</label>
                  <input type="number" value={form.cooldownSeconds} onChange={e => setForm({ ...form, cooldownSeconds: Number(e.target.value) })} />
                </div>
              </div>

              {/* Conditions */}
              <div className="section-label">📋 Conditions <button className="add-btn" onClick={addCond}>+ Add</button></div>
              {form.conditions.map((c, i) => (
                <div className="cond-row" key={i}>
                  <select value={c.sensor} onChange={e => updateCond(i, 'sensor', e.target.value)}>
                    {SENSORS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={c.operator} onChange={e => updateCond(i, 'operator', e.target.value)}>
                    {Object.entries(OPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  {c.sensor === 'motion' ? (
                    <select value={c.value} onChange={e => updateCond(i, 'value', e.target.value)}>
                      <option value="1">Detected (1)</option>
                      <option value="0">No Motion (0)</option>
                    </select>
                  ) : (
                    <input type="number" value={c.value} onChange={e => updateCond(i, 'value', e.target.value)} />
                  )}
                  <button className="remove-btn" onClick={() => removeCond(i)}>✕</button>
                </div>
              ))}

              {/* Actions */}
               <div className="section-label">🎯 Actions <button className="add-btn" onClick={addAction}>+ Add</button></div>
               {form.actions.map((a, i) => (
                 <div className="action-row" key={i}>
                   <select value={a.targetDevice} onChange={e => updateAction(i, 'targetDevice', e.target.value)}>
                     <option value="">Select Device...</option>
                     {allDevices.map(d => <option key={d.deviceId} value={d.title}>{d.title}</option>)}
                   </select>
                   <select value={a.command} onChange={e => updateAction(i, 'command', e.target.value)}>
                    {COMMANDS.map(c => <option key={c} value={c}>{fmtCmd(c)}</option>)}
                  </select>
                  <button className="remove-btn" onClick={() => removeAction(i)}>✕</button>
                </div>
              ))}
              
              <div className="form-divider"></div>
              <div className="form-group">
                <label className="checkbox-label large">
                  <input 
                    type="checkbox" 
                    checked={form.room === 'Global'} 
                    onChange={e => setForm({ ...form, room: e.target.checked ? 'Global' : currentRoom?.name || 'Global' })} 
                  />
                  <span>🌍 Apply this automation to ALL rooms</span>
                </label>
              </div>
            </div>
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="save-btn" onClick={saveRule}>{editId ? 'Update' : 'Create'} Rule</button>
            </div>
          </div>
        </div>
      )}

       {toast && <div className="toast">{toast}</div>}
 
       <AddRoomModal 
         isOpen={isRoomModalOpen} 
         onClose={() => setIsRoomModalOpen(false)} 
         onAdd={handleAddRoom} 
       />
     </div>

  );
};

export default Scenes;
