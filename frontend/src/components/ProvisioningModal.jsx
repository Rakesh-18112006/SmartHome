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
          <div className="step-content">
            <p className="step-hint">What appliance would you like to add?</p>
            <div className="icon-grid">
              {icons.map(item => (
                <button 
                  key={item.label}
                  className={`icon-select-btn ${formData.icon === item.icon ? 'active' : ''}`}
                  onClick={() => {
                    setFormData({ ...formData, icon: item.icon, label: item.label });
                    if (item.label === 'Touch Panel') {
                      updateSubDevices(1, 0);
                    }
                  }}
                >
                  <span className="icon-img">{item.icon}</span>
                  <span className="icon-label">{item.label}</span>
                </button>
              ))}
            </div>
            <button className="next-btn" onClick={handleNext}>Continue</button>
          </div>
        )}

        {step === 2 && (
          <div className="step-content scrollable">
            <p className="step-hint">Complete the details below to pair your device.</p>
            
            <div className="form-section">
              <h4>Appliance Details</h4>
              <div className="form-group">
                <label>Appliance Name</label>
                <input 
                  type="text" 
                  placeholder="e.g. Master Bedroom Fan"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Device ID (from Hardware)</label>
                <input 
                  type="text" 
                  placeholder="e.g. BSP00000301"
                  value={formData.deviceId}
                  onChange={(e) => setFormData({ ...formData, deviceId: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Assign to Room</label>
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

            {formData.label === 'Touch Panel' && (
              <>
                <div className="form-divider"></div>
                <div className="form-section">
                  <h4>Panel Configuration</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Normal Switches</label>
                      <input 
                        type="number" min="1" max="12"
                        value={formData.numSwitches}
                        onChange={(e) => {
                          const count = parseInt(e.target.value) || 0;
                          setFormData({ ...formData, numSwitches: count });
                          // Update subdevices list
                          updateSubDevices(count, formData.numFans);
                        }}
                      />
                    </div>
                    <div className="form-group">
                      <label>Fan Switches</label>
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

                  <div className="sub-devices-config">
                    <p className="step-hint" style={{ marginTop: '12px', fontSize: '11px' }}>Label each button for the dashboard:</p>
                    {subDevices.map((sd, i) => (
                      <div key={i} className="form-group sub-device-row">
                        <span className="index-label">{sd.index}. {sd.type === 'fan' ? '🌀' : '💡'}</span>
                        <input 
                          type="text" 
                          placeholder={`${sd.type} ${sd.index} Name`}
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
              </>
            )}

            <div className="form-divider"></div>

            <div className="form-section">
              <h4>WiFi Settings</h4>
              <div className="form-group">
                <label>WiFi Network (SSID)</label>
                <input 
                  type="text" 
                  placeholder="e.g. MyHome_WiFi"
                  value={formData.ssid}
                  onChange={(e) => setFormData({ ...formData, ssid: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Password</label>
                <input 
                  type="password" 
                  placeholder="••••••••"
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                />
              </div>
            </div>

            <div className="btn-row">
              <button className="back-btn" onClick={handleBack}>Back</button>
              <button className="next-btn primary" onClick={startProvisioning}>
                Connect & Setup
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
          background: var(--bg-card); width: 90%; max-width: 420px; border-radius: 32px; padding: 40px;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.15); position: relative; overflow: hidden;
        }
        .modal-header { margin-bottom: 32px; }
        .modal-header h2 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
        .close-btn { position: absolute; top: 24px; right: 24px; font-size: 24px; background: none; color: #cbd5e1; }
        
        .step-hint { color: var(--text-muted); font-size: 14px; margin-bottom: 24px; }
        
        .icon-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
        .icon-select-btn {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 20px 10px; border-radius: 20px; background: var(--bg-secondary); border: 2px solid transparent;
          transition: var(--transition);
        }
        .icon-select-btn:hover { background: var(--bg-tertiary); }
        .icon-select-btn.active { background: #eff6ff; border-color: var(--primary); }
        .icon-img { font-size: 32px; }
        .icon-label { font-size: 12px; font-weight: 700; color: var(--text-muted); }
        .active .icon-label { color: var(--primary); }

        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; }
        .form-group input { width: 100%; padding: 14px 18px; border-radius: 16px; border: 1px solid var(--border); outline: none; background: var(--bg-secondary); }
        .form-group input:focus { border-color: var(--primary); background: var(--bg-card); }

        .form-section h4 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: var(--primary); margin-bottom: 16px; }
        .form-divider { height: 1px; background: var(--border); margin: 24px 0; }
        .room-select-input { width: 100%; padding: 14px 18px; border-radius: 16px; border: 1px solid var(--border); background: var(--bg-secondary); outline: none; appearance: none; }
        
        .scrollable { max-height: 400px; overflow-y: auto; padding-right: 8px; }
        .scrollable::-webkit-scrollbar { width: 4px; }
        .scrollable::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }

        .btn-row { display: flex; gap: 16px; margin-top: 32px; }
        .next-btn { width: 100%; padding: 16px; background: var(--primary); color: white; border-radius: 16px; font-weight: 700; }
        .back-btn { width: 100px; background: var(--bg-tertiary); color: var(--text-muted); border-radius: 16px; font-weight: 600; }
        
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

        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .sub-device-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
        .index-label { font-size: 13px; font-weight: 800; color: var(--primary); min-width: 40px; }
        .sub-devices-config { margin-top: 16px; background: var(--bg-secondary); padding: 16px; border-radius: 16px; }

        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default ProvisioningModal;
