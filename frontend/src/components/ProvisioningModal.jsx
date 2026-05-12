import React, { useState, useEffect } from 'react';

const ProvisioningModal = ({ isOpen, onClose, onFinish }) => {
  const API_BASE = `http://${window.location.hostname}:3000`;
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: '',
    icon: '💡',
    ssid: '',
    password: '',
    room: 'Unassigned',
    deviceId: '',
    numSwitches: 1,
    numFans: 0
  });
  const [subDevices, setSubDevices] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setFormData({
        title: '',
        icon: '💡',
        ssid: '',
        password: '',
        room: 'Unassigned',
        deviceId: '',
        numSwitches: 1,
        numFans: 0
      });
      fetchRooms();
    }
  }, [isOpen]);

  const fetchRooms = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/rooms`);
      const data = await res.json();
      setRooms(data);
    } catch (err) {
      console.error('Failed to fetch rooms', err);
    }
  };

  if (!isOpen) return null;

  const icons = [
    { label: 'Light', icon: '💡' },
    { label: 'Plug', icon: '🔌' },
    { label: 'RGBW', icon: '🌈' },
    { label: 'Curtain', icon: '🪟' },
    { label: '3-Phase Auditor', icon: '🏭' },
    { label: 'Single Phase Auditor', icon: '⚡' },
    { label: 'Touch Panel', icon: '🖐️' }
  ];

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);

  const updateSubDevices = (switches, fans) => {
    const list = [];
    for (let i = 1; i <= switches; i++) {
      list.push({ index: i, type: 'switch', label: `Switch ${i}`, on: false });
    }
    for (let i = 1; i <= fans; i++) {
      list.push({ index: switches + i, type: 'fan', label: `Fan ${i}`, on: false, speed: 1 });
    }
    setSubDevices(list);
  };

  const startProvisioning = () => {
    setIsConnecting(true);
    // Simulate IoT connection delay
    setTimeout(() => {
      setIsConnecting(false);
      const deviceId = formData.deviceId || `esp-${Math.random().toString(16).slice(2, 6)}`;
      const type = (formData.label || 'light').toLowerCase();
      onFinish({
        deviceId: deviceId.trim(),
        title: formData.title || `My ${formData.label || 'Device'}`,
        type: type === 'touch panel' ? 'touch-panel' : type,
        icon: formData.icon,
        room: formData.room,
        isConfigured: true,
        topic: type === 'touch panel' 
          ? `touch-panel/${deviceId.trim()}/switch/status` 
          : `smarthome/${type}/${deviceId.trim()}`,
        subDevices: type === 'touch panel' ? subDevices : []
      });
      setStep(1);
      setFormData({ ...formData, title: '', ssid: '', password: '', room: 'Unassigned', numSwitches: 1, numFans: 0 });
      setSubDevices([]);
      onClose();
    }, 3000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up">
        <div className="modal-header">
          <h2>{step === 1 ? 'Select Device Type' : 'Configure & Connect'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {step === 1 && (
          <div className="step-content scrollable animate-slide-up">
            <div className="step-intro selection-mode">
              <div className="intro-text">
                <h3>What are we adding?</h3>
                <p>Choose an appliance type to get started.</p>
              </div>
            </div>

            <div className="icon-selection-grid">
              {icons.map(item => (
                <button 
                  key={item.label}
                  className={`device-type-card ${formData.icon === item.icon ? 'active' : ''}`}
                  onClick={() => {
                    setFormData({ ...formData, icon: item.icon, label: item.label });
                    if (item.label === 'Touch Panel') {
                      updateSubDevices(1, 0);
                    }
                  }}
                >
                  <div className="type-icon-wrapper">
                    <span className="type-icon">{item.icon}</span>
                  </div>
                  <span className="type-label">{item.label}</span>
                  <div className="selection-indicator"></div>
                </button>
              ))}
            </div>
            <div className="modal-footer-btns single">
              <button className="primary-setup-btn" onClick={handleNext} disabled={!formData.label}>
                Next Step
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="step-content scrollable">
            <div className="step-intro">
              <span className="selected-icon-preview">{formData.icon}</span>
              <div className="intro-text">
                <h3>{formData.label || 'New Device'}</h3>
                <p>Finalize the details to add this to your home.</p>
              </div>
            </div>
            
            <div className="setup-form-grid">
              <div className="form-card">
                <div className="card-tag">DEVICE INFO</div>
                <div className="form-group">
                  <label>Display Name</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Master Bedroom Fan"
                    value={formData.title}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Device ID</label>
                    <input 
                      type="text" 
                      placeholder="BSP..."
                      value={formData.deviceId}
                      onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                    />
                  </div>
                  <div className="form-group">
                    <label>Room</label>
                    <select 
                      value={formData.room}
                      className="room-select-input"
                      onChange={(e) => setFormData({ ...formData, room: e.target.value })}
                    >
                      <option value="Unassigned">Unassigned</option>
                      {rooms.map(r => <option key={r.name} value={r.name}>{r.name}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {formData.label === 'Touch Panel' && (
                <div className="form-card specialized">
                  <div className="card-tag">PANEL CONFIG</div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Switches</label>
                      <input 
                        type="number" min="1" max="12"
                        value={formData.numSwitches}
                        onChange={(e) => {
                          const count = parseInt(e.target.value) || 0;
                          setFormData({ ...formData, numSwitches: count });
                          updateSubDevices(count, formData.numFans);
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Fans</label>
                      <input 
                        type="number" min="0" max="4"
                        value={formData.numFans}
                        onChange={(e) => {
                          const count = parseInt(e.target.value) || 0;
                          setFormData({ ...formData, numFans: count });
                          updateSubDevices(formData.numSwitches, count);
                        }}
                      />
                    </div>
                  </div>

                  <div className="sub-devices-list">
                    {subDevices.map((sd, i) => (
                      <div key={i} className="mini-sub-input">
                        <span className="type-badge">{sd.type === 'fan' ? '🌀' : '💡'}</span>
                        <input 
                          type="text" 
                          placeholder={`Button ${sd.index}`}
                          value={sd.label}
                          onChange={(e) => {
                            const newSD = [...subDevices];
                            newSD[i].label = e.target.value;
                            setSubDevices(newSD);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>

            <div className="modal-footer-btns">
              <button className="secondary-btn" onClick={handleBack}>Change Type</button>
              <button className="primary-setup-btn" onClick={startProvisioning}>
                Complete Setup
              </button>
            </div>
          </div>
        )}

        {isConnecting && (
          <div className="loading-overlay">
            <div className="loader"></div>
            <p>Connecting to {formData.ssid}...</p>
            <span>Assigning to {formData.room === 'Unassigned' ? 'Unassigned' : formData.room} room</span>
          </div>
        )}
      </div>

      <style jsx>{`
        .modal-overlay {
          position: fixed; top: 0; left: 0; right: 0; bottom: 0;
          background: rgba(0, 0, 0, 0.4); backdrop-filter: blur(8px);
          display: flex; align-items: center; justify-content: center; z-index: 1100;
        }
        .modal-content {
          background: var(--bg-card); width: 90%; max-width: 440px; border-radius: 32px; padding: 40px;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.15); position: relative; overflow: hidden;
        }
        .modal-header { margin-bottom: 32px; }
        .modal-header h2 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
        .close-btn { position: absolute; top: 24px; right: 24px; font-size: 24px; background: none; color: #cbd5e1; }
        
        /* Step 2 Enhancements */
        .step-intro { display: flex; align-items: center; gap: 20px; margin-bottom: 32px; padding: 20px; background: var(--bg-secondary); border-radius: 24px; }
        .selected-icon-preview { font-size: 32px; background: white; width: 64px; height: 64px; display: flex; align-items: center; justify-content: center; border-radius: 20px; box-shadow: 0 10px 20px rgba(0,0,0,0.05); }
        .intro-text h3 { font-size: 18px; font-weight: 800; margin: 0; }
        .intro-text p { font-size: 12px; color: var(--text-muted); margin: 4px 0 0; }

        .setup-form-grid { display: flex; flex-direction: column; gap: 24px; }
        .form-card { background: white; padding: 24px; border-radius: 24px; border: 1px solid var(--border); position: relative; }
        .form-card.specialized { background: #f8fafc; border-style: dashed; }
        .card-tag { position: absolute; top: -10px; left: 20px; background: var(--primary); color: white; font-size: 9px; font-weight: 900; padding: 4px 10px; border-radius: 100px; letter-spacing: 0.5px; }

        .form-group { margin-bottom: 20px; }
        .form-group:last-child { margin-bottom: 0; }
        .form-group label { display: block; font-size: 11px; font-weight: 800; color: var(--text-muted); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.5px; }
        .form-group input, .room-select-input { 
          width: 100%; padding: 14px 18px; border-radius: 16px; border: 1px solid var(--border); 
          outline: none; background: #fdfdfd; font-size: 14px; transition: all 0.2s;
        }
        .form-group input:focus { border-color: var(--primary); box-shadow: 0 0 0 4px rgba(59, 130, 246, 0.1); }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }

        .sub-devices-list { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 20px; }
        .mini-sub-input { display: flex; align-items: center; gap: 8px; }
        .type-badge { font-size: 12px; width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: white; border-radius: 10px; border: 1px solid var(--border); flex-shrink: 0; }
        .mini-sub-input input { padding: 8px 12px; font-size: 12px; }

        .modal-footer-btns { display: flex; gap: 12px; margin-top: 32px; }
        .primary-setup-btn { flex: 2; padding: 16px; background: var(--primary); color: white; border-radius: 16px; font-weight: 800; font-size: 15px; box-shadow: 0 10px 20px var(--primary-glow); }
        .secondary-btn { flex: 1; padding: 16px; background: var(--bg-secondary); color: var(--text-muted); border-radius: 16px; font-weight: 700; font-size: 13px; }

        /* Step 1 Selection Grid */
        .icon-selection-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 32px; }
        .device-type-card {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 24px 16px; border-radius: 24px; background: #f8fafc; border: 2px solid transparent;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1); position: relative;
        }
        .device-type-card:hover { transform: translateY(-4px); background: #f1f5f9; }
        .device-type-card.active { background: #eff6ff; border-color: var(--primary); box-shadow: 0 10px 25px rgba(59, 130, 246, 0.1); }
        
        .type-icon-wrapper { 
          width: 56px; height: 56px; background: white; border-radius: 16px;
          display: flex; align-items: center; justify-content: center; font-size: 28px;
          box-shadow: 0 4px 10px rgba(0,0,0,0.05); transition: all 0.3s;
        }
        .active .type-icon-wrapper { background: var(--primary); color: white; transform: scale(1.1); }
        .type-label { font-size: 13px; font-weight: 800; color: var(--text-muted); }
        .active .type-label { color: var(--primary); }

        .selection-indicator { 
          position: absolute; top: 12px; right: 12px; width: 8px; height: 8px; 
          border-radius: 50%; background: var(--primary); opacity: 0; transform: scale(0); transition: all 0.3s;
        }
        .active .selection-indicator { opacity: 1; transform: scale(1); }

        .modal-footer-btns.single { margin-top: 16px; }
        
        .scrollable { max-height: 480px; overflow-y: auto; padding-right: 12px; margin-right: -12px; }
        .scrollable::-webkit-scrollbar { width: 6px; }
        .scrollable::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }

        .loading-overlay {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: var(--bg-card); display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 40px; z-index: 10;
        }
        .loader {
          width: 48px; height: 48px; border: 5px solid #f1f5f9; border-top-color: var(--primary);
          border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 24px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default ProvisioningModal;
