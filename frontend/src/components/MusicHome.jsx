import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Home, Search, Library, Music2, Disc3, Mic2, ListMusic, Play, Pause, SkipBack, SkipForward, Volume2, ArrowLeft, Loader2, X } from 'lucide-react';
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
  
  const location = useLocation();
  const passedPlayerId = location.state?.playerId || null;
  const passedPlayerUsed = useRef(false);

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
          supportsBrowse: haDevice.supportsBrowse || !!(haDevice.raw?.attributes?.supported_features & 131072),
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
      // First: try to find the MA equivalent of the passed player (preferred)
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
      
      // Fallback
      if (passedPlayer) {
        setActivePlayerId(passedPlayerId);
        passedPlayerUsed.current = true;
        return;
      }
    }
    
    // If we already have an MA player selected and it's still in the list, keep it
    const currentPlayer = players.find(p => p.deviceId === activePlayerId);
    if (activePlayerId && currentPlayer?.isMusicAssistant) return;
    
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

  // Track which player successfully returns browse results
  const workingBrowsePlayer = useRef(null);

  // Compute browsePlayerId: prefer the cached working player, then try heuristics
  const browsePlayerId = (() => {
    // If we already found one that works, stick with it
    if (workingBrowsePlayer.current && players.find(p => p.deviceId === workingBrowsePlayer.current)) {
      return workingBrowsePlayer.current;
    }
    // Otherwise use heuristics
    const ma = players.find(p => p.isMusicAssistant && p.supportsBrowse);
    if (ma) return ma.deviceId;
    const anyMA = players.find(p => p.isMusicAssistant);
    if (anyMA) return anyMA.deviceId;
    const anyBrowse = players.find(p => p.supportsBrowse);
    if (anyBrowse) return anyBrowse.deviceId;
    return activePlayerId;
  })();

  const activePlayer = players.find(p => p.deviceId === activePlayerId) || {};
  const [currentProgress, setCurrentProgress] = useState(0);
  
  // UI Drag state and debounce refs
  const [dragVolume, setDragVolume] = useState(null);
  const [dragProgress, setDragProgress] = useState(null);
  const volumeTimeout = useRef(null);
  const seekTimeout = useRef(null);
  
  // Queue UI state
  const [showQueue, setShowQueue] = useState(false);
  const [localQueue, setLocalQueue] = useState([]);
  const libraryTabs = [
    { id: 'library', label: 'Home', icon: Library },
    { id: 'artists', label: 'Artists', icon: Mic2 },
    { id: 'albums', label: 'Albums', icon: Disc3 },
    { id: 'tracks', label: 'Tracks', icon: Music2 },
    { id: 'playlists', label: 'Playlists', icon: ListMusic },
  ];

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


  // Browsing logic with unified auto-fallback
  const fetchMediaResilient = useCallback((initialPlayerId, eventName, queryOrType, id, callback) => {
    if (!socket) return;
    const startPlayerId = workingBrowsePlayer.current || initialPlayerId;
    
    const attempt = (playerId, candidates) => {
      const payload = { entity_id: playerId };
      if (eventName === 'ha_search_media') {
        payload.query = queryOrType;
      } else {
        if (queryOrType) payload.media_content_type = queryOrType;
        if (id) payload.media_content_id = id;
      }
      
      socket.emit(eventName, payload, (response) => {
        const hasResults = response?.result?.children?.length > 0;
        if (hasResults || response?.success !== false) {
          if (hasResults) workingBrowsePlayer.current = playerId;
          callback(response);
        } else {
          if (candidates.length === 0) {
            callback(null);
          } else {
            attempt(candidates[0].deviceId, candidates.slice(1));
          }
        }
      });
    };
    
    const candidates = players.filter(p => p.deviceId !== startPlayerId);
    attempt(startPlayerId, candidates);
  }, [players]);

  const browseMedia = useCallback((entityId, type, id) => {
    setIsBrowsing(true);
    fetchMediaResilient(entityId, 'ha_browse_media', type, id, (response) => {
      setIsBrowsing(false);
      setMediaItems(response?.result?.children || []);
    });
  }, [fetchMediaResilient]);

  const loadTab = useCallback((tab) => {
    if (!browsePlayerId) return;
    setActiveTab(tab);
    setSearchQuery('');
    
    if (tab === 'library') {
      setMediaPath([{ title: 'Library', id: '', type: '' }]);
      browseMedia(browsePlayerId, '', '');
    } else {
      setIsBrowsing(true);
      fetchMediaResilient(browsePlayerId, 'ha_browse_media', '', '', (response) => {
        if (response?.result?.children) {
          const target = response.result.children.find(c => c.title.toLowerCase() === tab);
          if (target) {
            setMediaPath([
              { title: 'Library', id: '', type: '' }, 
              { title: target.title, id: target.media_content_id, type: target.media_content_type }
            ]);
            browseMedia(browsePlayerId, target.media_content_type, target.media_content_id);
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
  }, [browsePlayerId, browseMedia, fetchMediaResilient]);

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
      fetchMediaResilient(browsePlayerId, 'ha_search_media', query.trim(), '', (response) => {
        setIsBrowsing(false);
        setMediaItems(response?.result?.children || []);
      });
    }, 500);
  }, [browsePlayerId, activeTab, loadTab, fetchMediaResilient]);

  // Initial load
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
      // If clicking a track in a list, queue this track and all subsequent tracks
      let tracksToQueue = [item.media_content_id];
      
      if (item.media_class === 'track' && mediaItems.length > 1) {
        const itemIndex = mediaItems.findIndex(m => m.media_content_id === item.media_content_id);
        if (itemIndex !== -1) {
          const subsequentItems = mediaItems.slice(itemIndex).filter(m => m.media_class === 'track');
          tracksToQueue = subsequentItems.map(m => m.media_content_id);
          setLocalQueue(subsequentItems.slice(1));
        }
      } else {
        setLocalQueue([]);
      }

      // 1. Play the selected track immediately
      socket.emit('ha_command', {
        domain: 'media_player',
        service: 'play_media',
        entityId: activePlayerId,
        serviceData: {
          media_content_type: item.media_content_type,
          media_content_id: tracksToQueue[0],
          enqueue: 'play'
        }
      });

      // 2. Queue all subsequent tracks sequentially
      if (tracksToQueue.length > 1) {
        tracksToQueue.slice(1).forEach((trackId, idx) => {
          setTimeout(() => {
            socket.emit('ha_command', {
              domain: 'media_player',
              service: 'play_media',
              entityId: activePlayerId,
              serviceData: {
                media_content_type: item.media_content_type,
                media_content_id: trackId,
                enqueue: 'add'
              }
            });
          }, (idx + 1) * 200); // 200ms delay between each to maintain order
        });
        
        // Show queue panel if we queued multiple songs
        setTimeout(() => setShowQueue(true), 1000);
      }
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

  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setDragVolume(val);
    if (volumeTimeout.current) clearTimeout(volumeTimeout.current);
    volumeTimeout.current = setTimeout(() => {
      sendCommand('volume_set', { volume_level: val / 100 });
      setTimeout(() => setDragVolume(null), 1000);
    }, 200);
  };

  const handleSeekChange = (e) => {
    const val = parseFloat(e.target.value);
    setDragProgress(val);
    if (seekTimeout.current) clearTimeout(seekTimeout.current);
    seekTimeout.current = setTimeout(() => {
      sendCommand('media_seek', { seek_position: val });
      setTimeout(() => setDragProgress(null), 1000);
    }, 200);
  };

  // Keep local queue somewhat in sync (remove items as they play)
  useEffect(() => {
    if (activePlayer.mediaTitle && localQueue.length > 0) {
      const titleMatchesTop = localQueue[0].title.includes(activePlayer.mediaTitle) || activePlayer.mediaTitle.includes(localQueue[0].title);
      if (titleMatchesTop) {
        setLocalQueue(prev => prev.slice(1));
      }
    }
  }, [activePlayer.mediaTitle]);
  return (
    <div className="music-app">
      {/* Sidebar */}
      <aside className="music-sidebar">
        <div className="music-sidebar-header">
          <Music2 size={24} color="var(--primary)" />
          <h2>Music</h2>
        </div>
        
        <div className="music-nav-group">
          {/* Back button moved to header */}
        </div>

        <div className="music-nav-group">
          <div className="music-nav-label">Library</div>
          {libraryTabs.map(({ id, label, icon: Icon }) => (
            <button key={id} className={`music-nav-item ${activeTab === id && !searchQuery ? 'active' : ''}`} onClick={() => loadTab(id)}>
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <main className="music-main">
        <header className="music-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', width: '100%' }}>
            <button className="icon-back-btn" onClick={handleBackPath} title="Go Back">
              <ArrowLeft size={20} />
            </button>
            <div className="music-search">
              <Search size={18} color="var(--text-muted)" />
              <input 
                type="text" 
                placeholder="Search library, artists, songs..." 
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
              />
            </div>
          </div>
          <div className="music-header-actions">
          </div>
        </header>

        <div className="music-top-tabs">
          {libraryTabs.map(({ id, label }) => (
            <button key={id} className={`music-nav-item ${activeTab === id && !searchQuery ? 'active' : ''}`} onClick={() => loadTab(id)}>
              {label}
            </button>
          ))}
        </div>

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
                      <div className="music-card-title">
                        {['track', 'album'].includes(item.media_class) && item.title.includes(' - ')
                          ? item.title.split(' - ').slice(1).join(' - ').trim()
                          : item.title}
                      </div>
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

        {/* Queue Slide-over Panel */}
        {showQueue && (
          <div className="music-queue-panel">
            <div className="music-queue-header">
              <h2>Up Next</h2>
              <button className="music-queue-close" onClick={() => setShowQueue(false)}>
                <X size={20} />
              </button>
            </div>
            <div className="music-queue-list">
              {localQueue.length === 0 ? (
                <div style={{ color: 'var(--text-muted)', padding: '1rem', textAlign: 'center' }}>No upcoming tracks.</div>
              ) : (
                localQueue.map((qItem, idx) => (
                  <div key={idx} className="music-queue-item" onClick={() => handleMediaClick(qItem)}>
                    {qItem.thumbnail ? (
                      <img src={proxyImg(qItem.thumbnail)} alt={qItem.title} />
                    ) : (
                      <div className="music-queue-fallback"><Music2 size={16} color="var(--text-muted)"/></div>
                    )}
                    <div className="music-queue-info">
                      <div className="music-queue-title">
                        {qItem.title.includes(' - ') ? qItem.title.split(' - ').slice(1).join(' - ').trim() : qItem.title}
                      </div>
                      <div className="music-queue-artist">
                        {qItem.title.includes(' - ') ? qItem.title.split(' - ')[0].trim() : 'Track'}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

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
              {console.log('PLAYER ATTRIBUTES:', activePlayer.raw?.attributes)}
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
              <span className="progress-time">{formatTime(dragProgress !== null ? dragProgress : currentProgress)}</span>
              <input type="range" className="progress-bar" 
                min="0" max={activePlayer.mediaDuration || 100}
                value={dragProgress !== null ? dragProgress : (currentProgress || 0)}
                onChange={handleSeekChange}
              />
              <span className="progress-time">{formatTime(activePlayer.mediaDuration)}</span>
            </div>
          </div>

          <div className="player-extra">
            <button className={`player-btn ${showQueue ? 'active' : ''}`} onClick={() => setShowQueue(!showQueue)} style={{ marginRight: '1rem' }} title="Queue">
              <ListMusic size={18} color={showQueue ? 'var(--primary)' : 'var(--text-secondary)'} />
            </button>
            <div className="volume-control">
              <span style={{ color: 'var(--text-secondary)', display: 'flex' }}>
                <Volume2 size={16} />
              </span>
              <input type="range" className="volume-slider" 
                min="0" max="100" 
                value={dragVolume !== null ? dragVolume : (activePlayer.volume || 0)}
                onChange={handleVolumeChange}
              />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
