import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, Search, Library, Music2, Disc3, Mic2, ListMusic, Play, Pause, SkipBack, SkipForward, Volume2, ArrowLeft, Loader2 } from 'lucide-react';
import { socket, fetchWithAuth } from '../App';
import '../music.css';

const API_BASE = `http://${window.location.hostname}:3000`;

function proxyImg(url) {
  if (!url) return null;
  if (url.includes('/api/ha/image')) return url;
  return `${API_BASE}/api/ha/image?url=${encodeURIComponent(url)}`;
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function MusicHome() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('library'); // library, artists, albums, tracks, playlists
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaPath, setMediaPath] = useState([]);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [players, setPlayers] = useState([]);
  const [activePlayerId, setActivePlayerId] = useState(null);

  // Setup Socket listener to sync media players (same logic as App.jsx)
  useEffect(() => {
    const handleStateChange = (haDevice) => {
      if (haDevice.type !== 'media_player') return;
      setPlayers(prev => {
        const idx = prev.findIndex(p => p.deviceId === haDevice.entity_id);
        const mapped = {
          deviceId: haDevice.entity_id,
          title: haDevice.name,
          mediaState: haDevice.state,
          on: haDevice.state !== 'off' && haDevice.state !== 'unavailable',
          volume: Math.round((haDevice.raw?.attributes?.volume_level || 0) * 100),
          mediaTitle: haDevice.raw?.attributes?.media_title || '',
          mediaArtist: haDevice.raw?.attributes?.media_artist || '',
          mediaAlbum: haDevice.raw?.attributes?.media_album_name || '',
          albumArt: proxyImg(haDevice.raw?.attributes?.entity_picture),
          mediaPosition: haDevice.raw?.attributes?.media_position || 0,
          mediaDuration: haDevice.raw?.attributes?.media_duration || 0,
          mediaPositionUpdatedAt: haDevice.raw?.attributes?.media_position_updated_at,
          isMusicAssistant: haDevice.isMusicAssistant || haDevice.raw?.attributes?.app_id === 'music_assistant',
        };
        
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = mapped;
          return next;
        }
        return [...prev, mapped];
      });
    };

    socket.on('ha_entity_state_change', handleStateChange);
    
    // Fetch via REST API
    fetchWithAuth(`${API_BASE}/api/devices`)
      .then(res => res.json())
      .then(data => {
        const mapped = data.filter(d => d.type === 'media_player').map(d => ({
          deviceId: d.deviceId,
          title: d.name,
          mediaState: d.state,
          on: d.state !== 'off' && d.state !== 'unavailable',
          volume: Math.round((d.attributes?.volume_level || 0) * 100),
          mediaTitle: d.attributes?.media_title || '',
          mediaArtist: d.attributes?.media_artist || '',
          mediaAlbum: d.attributes?.media_album_name || '',
          albumArt: proxyImg(d.attributes?.entity_picture),
          mediaPosition: d.attributes?.media_position || 0,
          mediaDuration: d.attributes?.media_duration || 0,
          mediaPositionUpdatedAt: d.attributes?.media_position_updated_at,
          isMusicAssistant: d.isMusicAssistant,
        }));
        setPlayers(mapped);
      }).catch(console.error);

    return () => {
      socket.off('ha_entity_state_change', handleStateChange);
    };
  }, []);

  // Determine active player for the bottom bar and browsing
  useEffect(() => {
    if (players.length > 0 && !activePlayerId) {
      const playing = players.find(p => p.mediaState === 'playing' && p.isMusicAssistant);
      const maPlayer = players.find(p => p.isMusicAssistant);
      setTimeout(() => {
        setActivePlayerId(playing?.deviceId || maPlayer?.deviceId || players[0].deviceId);
      }, 0);
    }
  }, [players, activePlayerId]);

  const activePlayer = players.find(p => p.deviceId === activePlayerId) || {};
  const [currentProgress, setCurrentProgress] = useState(0);

  // Update progress bar smoothly
  useEffect(() => {
    let interval;
    if (activePlayer.mediaState === 'playing' && activePlayer.mediaPositionUpdatedAt) {
      const updateProgress = () => {
        const now = Date.now() / 1000;
        const updated = new Date(activePlayer.mediaPositionUpdatedAt).getTime() / 1000;
        const diff = Math.max(0, now - updated);
        setCurrentProgress(Math.min((activePlayer.mediaPosition || 0) + diff, activePlayer.mediaDuration || 0));
      };
      updateProgress();
      interval = setInterval(updateProgress, 1000);
    } else {
      setTimeout(() => {
        setCurrentProgress(activePlayer.mediaPosition || 0);
      }, 0);
    }
    return () => clearInterval(interval);
  }, [activePlayer.mediaState, activePlayer.mediaPosition, activePlayer.mediaPositionUpdatedAt, activePlayer.mediaDuration]);


  // Browsing logic
  const browseMedia = useCallback((entityId, type, id) => {
    if (!socket || !entityId) return;
    setIsBrowsing(true);
    const payload = { entity_id: entityId };
    if (type) payload.media_content_type = type;
    if (id) payload.media_content_id = id;
    
    socket.emit('ha_browse_media', payload, (response) => {
      setIsBrowsing(false);
      if (response && response.result) {
        setMediaItems(response.result.children || []);
      } else {
        setMediaItems([]);
      }
    });
  }, []);

  const loadTab = useCallback((tab) => {
    if (!activePlayerId) return;
    setActiveTab(tab);
    setSearchQuery('');
    
    if (tab === 'library') {
      setMediaPath([{ title: 'Library', id: '', type: '' }]);
      browseMedia(activePlayerId, '', '');
    } else {
      setIsBrowsing(true);
      // Fetch root library to reliably locate the tab's exact ID for ANY media player
      socket.emit('ha_browse_media', { entity_id: activePlayerId }, (response) => {
        if (response && response.result && response.result.children) {
          const target = response.result.children.find(c => c.title.toLowerCase() === tab);
          if (target) {
            setMediaPath([
              { title: 'Library', id: '', type: '' }, 
              { title: target.title, id: target.media_content_id, type: target.media_content_type }
            ]);
            browseMedia(activePlayerId, target.media_content_type, target.media_content_id);
          } else {
            setIsBrowsing(false);
            setMediaItems([]);
          }
        } else {
          setIsBrowsing(false);
          setMediaItems([]);
        }
      });
    }
  }, [activePlayerId, browseMedia]);

  // Search Logic
  const searchTimeout = useRef(null);
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) { 
      loadTab(activeTab); // Reload current tab if search cleared
      return; 
    }
    
    setIsBrowsing(true);
    searchTimeout.current = setTimeout(() => {
      socket.emit('ha_search_media', { entity_id: activePlayerId, query: query.trim() }, (response) => {
        setIsBrowsing(false);
        if (response && response.result && response.result.children) {
          setMediaItems(response.result.children);
        } else {
          setMediaItems([]);
        }
      });
    }, 500);
  }, [activePlayerId, activeTab, loadTab]);

  // Initial load
  useEffect(() => {
    if (activePlayerId && mediaPath.length === 0 && !searchQuery) {
      setTimeout(() => {
        loadTab('library');
      }, 0);
    }
  }, [activePlayerId, loadTab, mediaPath.length, searchQuery]);

  const handleMediaClick = (item) => {
    if (item.can_expand) {
      setMediaPath(prev => [...prev, { title: item.title, id: item.media_content_id, type: item.media_content_type }]);
      browseMedia(activePlayerId, item.media_content_type, item.media_content_id);
    } else if (item.can_play) {
      socket.emit('ha_command', {
        domain: 'media_player',
        service: 'play_media',
        entityId: activePlayerId,
        serviceData: {
          media_content_type: item.media_content_type,
          media_content_id: item.media_content_id
        }
      });
    }
  };

  const handleBackPath = () => {
    if (mediaPath.length <= 1) {
      navigate('/dashboard');
      return;
    }
    const newPath = mediaPath.slice(0, -1);
    setMediaPath(newPath);
    const target = newPath[newPath.length - 1];
    if (target.id === '' && target.type === '') {
      browseMedia(activePlayerId, '', '');
    } else {
      browseMedia(activePlayerId, target.type, target.id);
    }
  };

  const sendCommand = (service, serviceData = {}) => {
    if (!activePlayerId) return;
    socket.emit('ha_command', {
      domain: 'media_player',
      service,
      entityId: activePlayerId,
      serviceData
    });
  };

  const handlePlayPause = () => {
    if (activePlayer.mediaState === 'playing') sendCommand('media_pause');
    else sendCommand('media_play');
  };

  return (
    <div className="music-app">
      {/* Sidebar */}
      <aside className="music-sidebar">
        <div className="music-sidebar-header">
          <Music2 size={24} color="var(--primary)" />
          <h2>Music</h2>
        </div>
        
        <div className="music-nav-group">
          <button className="music-nav-item" onClick={() => navigate('/dashboard')}>
            <Home size={18} /> Back to Dashboard
          </button>
        </div>

        <div className="music-nav-group">
          <div className="music-nav-label">Library</div>
          <button className={`music-nav-item ${activeTab === 'library' && !searchQuery ? 'active' : ''}`} onClick={() => loadTab('library')}>
            <Library size={18} /> Home
          </button>
          <button className={`music-nav-item ${activeTab === 'artists' && !searchQuery ? 'active' : ''}`} onClick={() => loadTab('artists')}>
            <Mic2 size={18} /> Artists
          </button>
          <button className={`music-nav-item ${activeTab === 'albums' && !searchQuery ? 'active' : ''}`} onClick={() => loadTab('albums')}>
            <Disc3 size={18} /> Albums
          </button>
          <button className={`music-nav-item ${activeTab === 'tracks' && !searchQuery ? 'active' : ''}`} onClick={() => loadTab('tracks')}>
            <Music2 size={18} /> Tracks
          </button>
          <button className={`music-nav-item ${activeTab === 'playlists' && !searchQuery ? 'active' : ''}`} onClick={() => loadTab('playlists')}>
            <ListMusic size={18} /> Playlists
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="music-main">
        <header className="music-header">
          <div className="music-header-actions">
            <button className="music-back-btn" onClick={handleBackPath} title="Go Back">
              <ArrowLeft size={20} />
            </button>
          </div>
          <div className="music-search">
            <Search size={18} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search library, artists, songs..." 
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
            />
          </div>
        </header>

        <div className="music-content">
          <div className="music-content-header">
            <h1>{searchQuery ? 'Search Results' : mediaPath[mediaPath.length - 1]?.title || 'Library'}</h1>
          </div>

          {isBrowsing ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}>
              <Loader2 className="spin-icon" size={32} color="var(--primary)" />
            </div>
          ) : (
            mediaItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4rem', color: 'var(--text-muted)' }}>
                No items found.
              </div>
            ) : (
              <div className="music-grid">
                {mediaItems.map((item, idx) => (
                  <div key={item.media_content_id + idx} className="music-card" onClick={() => handleMediaClick(item)}>
                    <div className={`music-card-img-wrapper ${item.media_class === 'artist' ? 'artist' : ''}`}>
                      {item.thumbnail ? (
                        <img src={proxyImg(item.thumbnail)} alt={item.title} loading="lazy" />
                      ) : (
                        item.media_class === 'artist' ? <Mic2 size={28} color="var(--text-muted)" /> : 
                        item.media_class === 'track' ? <Music2 size={28} color="var(--text-muted)" /> : 
                        <Disc3 size={28} color="var(--text-muted)" />
                      )}
                      {item.can_play && (
                        <button className="music-card-play" onClick={(e) => { e.stopPropagation(); handleMediaClick(item); }}>
                          <Play size={18} style={{ marginLeft: '2px' }} />
                        </button>
                      )}
                    </div>
                    <div className="music-card-info">
                      <div className="music-card-title">{item.title}</div>
                      <div className="music-card-subtitle" style={{ textTransform: 'capitalize' }}>
                        {item.media_class === 'directory' ? 'Folder' : item.media_class}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>

        {/* Bottom Player Bar */}
        <div className="music-player-bar">
          <div className="player-now-playing">
            {activePlayer.albumArt ? (
              <img src={activePlayer.albumArt} alt="Album Art" className="player-art" />
            ) : (
              <div className="player-art" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Music2 size={24} color="var(--text-muted)" />
              </div>
            )}
            <div className="player-info">
              <div className="player-title">{activePlayer.mediaTitle || 'Not Playing'}</div>
              <div className="player-artist">{activePlayer.mediaArtist || activePlayer.title || 'Select a track to play'}</div>
            </div>
          </div>

          <div className="player-controls-wrapper">
            <div className="player-controls">
              <button className="player-btn" onClick={() => sendCommand('media_previous_track')}>
                <SkipBack size={20} />
              </button>
              <button className="player-btn play-pause" onClick={handlePlayPause}>
                {activePlayer.mediaState === 'playing' ? <Pause size={18} /> : <Play size={18} style={{ marginLeft: '2px' }} />}
              </button>
              <button className="player-btn" onClick={() => sendCommand('media_next_track')}>
                <SkipForward size={20} />
              </button>
            </div>
            <div className="player-progress">
              <span className="progress-time">{formatTime(currentProgress)}</span>
              <input type="range" className="progress-bar" 
                min="0" max={activePlayer.mediaDuration || 100}
                value={currentProgress || 0}
                onChange={(e) => sendCommand('media_seek', { seek_position: parseFloat(e.target.value) })}
              />
              <span className="progress-time">{formatTime(activePlayer.mediaDuration)}</span>
            </div>
          </div>

          <div className="player-extra">
            <div className="volume-control">
              <Volume2 size={16} color="var(--text-secondary)" />
              <input type="range" className="volume-slider" 
                min="0" max="100" 
                value={activePlayer.volume || 0}
                onChange={(e) => sendCommand('volume_set', { volume_level: parseFloat(e.target.value) / 100 })}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
