import React from 'react';
import { Activity, Zap, Sun, Wifi } from 'lucide-react';

const DeviceStatus = ({ status, mqttStatus }) => {
  const isOnline = mqttStatus === 'Connected';
  const data = status || {};

  return (
    <div className="card">
      <h2><Activity size={24} /> Device Status</h2>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: 'var(--text-secondary)' }}>Connection</span>
          <div className={`status-badge ${isOnline ? 'status-online' : 'status-offline'}`}>
            <Wifi size={14} /> {mqttStatus}
          </div>
        </div>

        <div className="card" style={{ padding: '1rem', background: 'rgba(0,0,0,0.1)', border: 'none' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                <Zap size={14} style={{ marginRight: '4px' }} /> STATE
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '700', color: data.state === 'ON' ? 'var(--success)' : 'var(--text-secondary)' }}>
                {data.state || 'UNKNOWN'}
              </div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.75rem', marginBottom: '0.5rem' }}>
                <Sun size={14} style={{ marginRight: '4px' }} /> BRIGHTNESS
              </div>
              <div style={{ fontSize: '1.25rem', fontWeight: '700' }}>
                {data.brightness !== undefined ? `${Math.round((data.brightness / 255) * 100)}%` : '--'}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Lux Level</span>
            <span>{data.lux !== undefined ? `${data.lux} lx` : '--'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Current Effect</span>
            <span style={{ textTransform: 'capitalize' }}>{data.effect || 'None'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem' }}>
            <span style={{ color: 'var(--text-secondary)' }}>Sensor Status</span>
            <span style={{ color: data.sensor === 'online' ? 'var(--success)' : 'var(--danger)' }}>
              {data.sensor || 'Unknown'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeviceStatus;
