import React, { useState, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, Speaker, Music2 } from 'lucide-react';
import './AudioDevices.css';

const AudioDevicesTab = ({ socket, allMediaPlayers }) => {
  const [localPlayers, setLocalPlayers] = useState(allMediaPlayers || []);

  // Update local state smoothly
  useEffect(() => {
    setLocalPlayers(allMediaPlayers || []);
  }, [allMediaPlayers]);

  const sendCommand = (entityId, service, serviceData = {}) => {
    if (!socket || !entityId) return;
    socket.emit('ha_command', {
      domain: 'media_player',
      service,
      entityId,
      serviceData
    });
  };

  const handlePlayPause = (player) => {
    if (player.mediaState === 'playing') {
      sendCommand(player.deviceId, 'media_pause');
    } else {
      sendCommand(player.deviceId, 'media_play');
    }
  };

  return (
    <div className="audio-devices-view p-8">
      <div className="audio-devices-header mb-8">
        <h2 className="text-3xl font-bold text-white flex items-center gap-3">
          <Speaker size={32} className="text-[var(--primary)]" />
          Audio Devices
        </h2>
        <p className="text-[var(--text-muted)] mt-2">Manage all available audio devices on your network.</p>
      </div>

      <div className="audio-devices-grid">
        {localPlayers.map(player => (
          <div key={player.deviceId} className="audio-device-card">
            <div className="audio-device-art">
              {player.albumArt ? (
                <img src={player.albumArt} alt="Album Art" />
              ) : (
                <div className="audio-device-art-placeholder">
                  <Music2 size={48} className="text-[var(--text-muted)] opacity-50" />
                </div>
              )}
            </div>
            
            <div className="audio-device-info">
              <h3 className="audio-device-name" title={player.title}>{player.title}</h3>
              <div className="audio-device-room">
                {player.room && player.room !== 'Unassigned' ? player.room : 'Unassigned Device'}
              </div>
              <div className="audio-device-state">
                {player.mediaState === 'playing' ? (
                  <span className="text-[var(--primary)] font-medium text-sm">
                    {player.mediaTitle ? `${player.mediaTitle} • ${player.mediaArtist}` : 'Playing'}
                  </span>
                ) : (
                  <span className="text-[var(--text-muted)] text-sm capitalize">
                    {player.mediaState || 'Idle'}
                  </span>
                )}
              </div>
            </div>

            <div className="audio-device-controls-wrapper">
              <div className="audio-device-playback">
                <button className="audio-btn" onClick={() => sendCommand(player.deviceId, 'media_previous_track')}>
                  <SkipBack size={18} />
                </button>
                <button className={`audio-btn play-pause ${player.mediaState === 'playing' ? 'playing' : ''}`} onClick={() => handlePlayPause(player)}>
                  {player.mediaState === 'playing' ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
                </button>
                <button className="audio-btn" onClick={() => sendCommand(player.deviceId, 'media_next_track')}>
                  <SkipForward size={18} />
                </button>
              </div>

              <div className="audio-device-volume">
                <Volume2 size={16} className="text-[var(--text-secondary)]" />
                <input 
                  type="range" 
                  min="0" 
                  max="100" 
                  value={player.volume || 0}
                  className="audio-volume-slider"
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setLocalPlayers(prev => prev.map(p => p.deviceId === player.deviceId ? { ...p, volume: val } : p));
                    sendCommand(player.deviceId, 'volume_set', { volume_level: val / 100 });
                  }}
                />
              </div>
            </div>
          </div>
        ))}

        {localPlayers.length === 0 && (
          <div className="col-span-full text-center py-12 text-[var(--text-muted)]">
            No audio devices found on the network.
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioDevicesTab;
