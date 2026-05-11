import React, { useState } from 'react';

const ProvisioningModal = ({ isOpen, onClose, onFinish }) => {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState({
    title: 'New Device',
    icon: '💡',
    ssid: '',
    password: ''
  });
  const [isConnecting, setIsConnecting] = useState(false);

  if (!isOpen) return null;

  const icons = [
    { label: 'Light', icon: '💡' },
    { label: 'Plug', icon: '🔌' },
    { label: 'Switch', icon: '🔘' },
    { label: 'Sensor', icon: '📊' },
    { label: 'RGBW', icon: '🌈' },
    { label: 'Curtain', icon: '🪟' }
  ];

  const handleNext = () => setStep(step + 1);
  const handleBack = () => setStep(step - 1);

  const startProvisioning = () => {
    setIsConnecting(true);
    // Simulate IoT connection delay
    setTimeout(() => {
      setIsConnecting(false);
      onFinish({
        deviceId: `esp-${Math.random().toString(16).slice(2, 6)}`,
        title: `Unconfigured ${formData.label || 'Device'}`,
        icon: formData.icon,
        isConfigured: false,
        room: 'Unassigned'
      });
      setStep(1);
      onClose();
    }, 3000);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content animate-slide-up">
        <div className="modal-header">
          <h2>{step === 1 ? 'Select Device Type' : step === 2 ? 'Connect to WiFi' : 'Provisioning'}</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        {step === 1 && (
          <div className="step-content">
            <p className="step-hint">What would you like to add?</p>
            <div className="icon-grid">
              {icons.map(item => (
                <button 
                  key={item.label}
                  className={`icon-select-btn ${formData.icon === item.icon ? 'active' : ''}`}
                  onClick={() => setFormData({ ...formData, icon: item.icon, label: item.label })}
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
          <div className="step-content">
            <p className="step-hint">Enter your WiFi details to connect the device.</p>
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
            <div className="btn-row">
              <button className="back-btn" onClick={handleBack}>Back</button>
              <button className="next-btn primary" onClick={startProvisioning}>
                Connect Device
              </button>
            </div>
          </div>
        )}

        {isConnecting && (
          <div className="loading-overlay">
            <div className="loader"></div>
            <p>Connecting to {formData.ssid}...</p>
            <span>Please keep the device powered on</span>
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
          background: white; width: 90%; max-width: 420px; border-radius: 32px; padding: 40px;
          box-shadow: 0 30px 60px rgba(0, 0, 0, 0.15); position: relative; overflow: hidden;
        }
        .modal-header { margin-bottom: 32px; }
        .modal-header h2 { font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
        .close-btn { position: absolute; top: 24px; right: 24px; font-size: 24px; background: none; color: #cbd5e1; }
        
        .step-hint { color: var(--text-muted); font-size: 14px; margin-bottom: 24px; }
        
        .icon-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 32px; }
        .icon-select-btn {
          display: flex; flex-direction: column; align-items: center; gap: 12px;
          padding: 20px 10px; border-radius: 20px; background: #f8fafc; border: 2px solid transparent;
          transition: var(--transition);
        }
        .icon-select-btn:hover { background: #f1f5f9; }
        .icon-select-btn.active { background: #eff6ff; border-color: var(--primary); }
        .icon-img { font-size: 32px; }
        .icon-label { font-size: 12px; font-weight: 700; color: var(--text-muted); }
        .active .icon-label { color: var(--primary); }

        .form-group { margin-bottom: 20px; }
        .form-group label { display: block; font-size: 13px; font-weight: 600; color: var(--text-muted); margin-bottom: 8px; }
        .form-group input { width: 100%; padding: 14px 18px; border-radius: 16px; border: 1px solid var(--border); outline: none; background: #f8fafc; }
        .form-group input:focus { border-color: var(--primary); background: white; }

        .btn-row { display: flex; gap: 16px; margin-top: 32px; }
        .next-btn { width: 100%; padding: 16px; background: var(--primary); color: white; border-radius: 16px; font-weight: 700; }
        .back-btn { width: 100px; background: #f1f5f9; color: var(--text-muted); border-radius: 16px; font-weight: 600; }
        
        .loading-overlay {
          position: absolute; top: 0; left: 0; right: 0; bottom: 0;
          background: white; display: flex; flex-direction: column; align-items: center; justify-content: center;
          text-align: center; padding: 40px; z-index: 10;
        }
        .loader {
          width: 48px; height: 48px; border: 5px solid #f3f3f3; border-top: 5px solid var(--primary);
          border-radius: 50%; animation: spin 1s linear infinite; margin-bottom: 24px;
        }
        @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
        .loading-overlay p { font-weight: 700; font-size: 18px; margin-bottom: 8px; }
        .loading-overlay span { color: var(--text-muted); font-size: 13px; }

        .animate-slide-up { animation: slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
      `}</style>
    </div>
  );
};

export default ProvisioningModal;
