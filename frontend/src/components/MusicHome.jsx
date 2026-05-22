import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, Music2, Disc3, Mic2, ListMusic, Play, Pause, SkipBack, SkipForward, Volume2, ArrowLeft, Loader2, Folder } from 'lucide-react';
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
  const location = useLocation();
  const passedPlayerId = location.state?.playerId || null;
  const [activeTab, setActiveTab] = useState('library'); // library, artists, albums, tracks, playlists
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaPath, setMediaPath] = useState([]);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [players, setPlayers] = useState([]);
  const [activePlayerId, setActivePlayerId] = useState(null);
  const passedPlayerUsed = useRef(false);

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
    
    // Request initial states since we might have missed them if we navigated here
    socket.emit('request_initial_states');

    return () => {
      socket.off('ha_entity_state_change', handleStateChange);
    };
  }, []);

  // Determine active player for the bottom bar (controls, now-playing)
  // Always prefer the Music Assistant version of a player since it has now-playing info
  useEffect(() => {
    if (players.length === 0) return;
    
    // If a player ID was passed from the dashboard and we haven't used it yet
    if (passedPlayerId && !passedPlayerUsed.current) {
      // First: try to find the MA equivalent of the passed player (preferred — has now-playing info)
      const passedPlayer = players.find(p => p.deviceId === passedPlayerId);
      const baseId = passedPlayerId.replace('media_player.', '');
      const passedName = passedPlayer?.title?.toLowerCase() || '';
      
      const maEquiv = players.find(p =>
        p.isMusicAssistant && p.deviceId !== passedPlayerId && (
          p.deviceId.includes(baseId) || 
          (passedName && p.title && p.title.toLowerCase().includes(passedName)) ||
          (passedName && p.title && passedName.includes(p.title.toLowerCase()))
        )
      );
      
      if (maEquiv) {
        setActivePlayerId(maEquiv.deviceId);
        passedPlayerUsed.current = true;
        return;
      }
      
      // Fallback: if the passed player itself is MA or no MA equiv found, use it directly
      if (passedPlayer) {
        setActivePlayerId(passedPlayerId);
        passedPlayerUsed.current = true;
        return;
      }
    }
    
    // If we already have an MA player selected and it's still in the list, keep it
    const currentPlayer = players.find(p => p.deviceId === activePlayerId);
    if (activePlayerId && currentPlayer?.isMusicAssistant) return;
    
    // If we have a non-MA player selected, check if an MA player is now available to upgrade to
    
    // Auto-select: prefer MA player that's playing, then any MA, then any playing, then first
    const playingMA = players.find(p => p.mediaState === 'playing' && p.isMusicAssistant);
    const anyMA = players.find(p => p.isMusicAssistant);
    const anyPlaying = players.find(p => p.mediaState === 'playing');
    
    if (playingMA) {
      setActivePlayerId(playingMA.deviceId);
    } else if (anyMA) {
      setActivePlayerId(anyMA.deviceId);
    } else if (anyPlaying) {
      setActivePlayerId(anyPlaying.deviceId);
    } else if (!activePlayerId) {
      setActivePlayerId(players[0].deviceId);
    }
  }, [players, activePlayerId, passedPlayerId]);

  // Always find a Music Assistant player for browsing (separate from playback controls)
  const browsePlayerId = (() => {
    const playingMA = players.find(p => p.mediaState === 'playing' && p.isMusicAssistant);
    if (playingMA) return playingMA.deviceId;
    const anyMA = players.find(p => p.isMusicAssistant);
    if (anyMA) return anyMA.deviceId;
    return activePlayerId; // fallback to active player if no MA found
  })();

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


  // Browsing logic — always uses browsePlayerId (a Music Assistant player)
  const browseMedia = useCallback((playerId, type, id) => {
    if (!socket || !playerId) return;
    setIsBrowsing(true);
    socket.emit('ha_browse_media', { 
      entity_id: playerId,
      media_content_type: type,
      media_content_id: id
    }, (response) => {
      setIsBrowsing(false);
      if (response && response.result && response.result.children) {
        setMediaItems(response.result.children.filter(i => i.title !== '..'));
      } else {
        setMediaItems([]);
      }
    });
  }, []);

  const loadTab = useCallback((tab) => {
    if (!browsePlayerId) return;
    setActiveTab(tab);
    setSearchQuery('');
    
    if (tab === 'library') {
      setMediaPath([{ title: 'Library', id: '', type: '' }]);
      browseMedia(browsePlayerId, '', '');
    } else {
      setIsBrowsing(true);
      const targetId = tab;
      const title = tab.charAt(0).toUpperCase() + tab.slice(1);
      
      setMediaPath([
        { title: 'Library', id: '', type: '' },
        { title: title, id: targetId, type: 'music_assistant' }
      ]);
      browseMedia(browsePlayerId, 'music_assistant', targetId);
    }
  }, [browsePlayerId, browseMedia]);

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
      socket.emit('mass_search_media', { query: query.trim() }, (response) => {
        setIsBrowsing(false);
        if (response && response.result && response.result.children) {
          setMediaItems(response.result.children);
        } else {
          setMediaItems([]);
        }
      });
    }, 500);
  }, [activeTab, loadTab]);

  // Initial load — use browsePlayerId
  useEffect(() => {
    if (browsePlayerId && mediaPath.length === 0 && !searchQuery) {
      setTimeout(() => {
        loadTab('library');
      }, 0);
    }
  }, [browsePlayerId, loadTab, mediaPath.length, searchQuery]);

  const handleMediaClick = (item) => {
    if (item.can_expand) {
      setMediaPath(prev => [...prev, { title: item.title, id: item.media_content_id, type: item.media_content_type }]);
      browseMedia(browsePlayerId, item.media_content_type, item.media_content_id);
    } else if (item.can_play) {
      socket.emit('mass_command', {
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
      browseMedia(browsePlayerId, '', '');
    } else {
      browseMedia(browsePlayerId, target.type, target.id);
    }
  };

  const sendCommand = (service, serviceData = {}) => {
    if (!activePlayerId) return;
    socket.emit('mass_command', {
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
                        <div className={`music-card-fallback-icon ${item.media_class || 'directory'}`}>
                          {item.media_class === 'artist' ? <Mic2 size={36} /> : 
                           item.media_class === 'track' ? <Music2 size={36} /> : 
                           item.media_class === 'album' ? <Disc3 size={36} /> : 
                           item.media_class === 'playlist' ? <ListMusic size={36} /> : 
                           <Folder size={36} />}
                        </div>
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
                        {typeof item.provider === 'string' && item.provider !== 'builtin' && item.provider !== 'library' && (
                          <span style={{ marginLeft: '6px', fontSize: '0.75rem', opacity: 0.8, color: 'var(--primary)' }}>
                            • {item.provider.split('--')[0].replace('ytmusic', 'YT Music').replace('apple_music', 'Apple Music')}
                          </span>
                        )}
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
