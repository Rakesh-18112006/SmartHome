import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Play, Pause, SkipBack, SkipForward, Volume2, Music, ListMusic, X, ChevronRight, Folder, Search, Disc3, Maximize2 } from 'lucide-react';

const API_BASE = `http://${window.location.hostname}:3000`;

// Proxy ALL HA images through our authenticated backend
function proxyImg(url) {
  if (!url) return null;
  if (url.includes('/api/ha/image')) return url;
  return `${API_BASE}/api/ha/image?url=${encodeURIComponent(url)}`;
}

export default function MusicDeck({ players, allMediaPlayers, onCommand, socket }) {
  const navigate = useNavigate();
  const [selectedId, setSelectedId] = useState(null);
  const [showMediaBrowser, setShowMediaBrowser] = useState(false);
  const [mediaItems, setMediaItems] = useState([]);
  const [mediaPath, setMediaPath] = useState([]);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [browseEntityId, setBrowseEntityId] = useState(null);
  const [optimisticState, setOptimisticState] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTab, setActiveTab] = useState('browse'); // 'browse' | 'search'
  const searchTimeout = useRef(null);
  const [currentProgress, setCurrentProgress] = useState(0);
  const isSeeking = useRef(false);

  if (!players || players.length === 0) return null;

  // Find active player for controls
  let activePlayerRaw = players.find(p => p.deviceId === selectedId);
  if (!activePlayerRaw) {
    activePlayerRaw = players.find(p => p.mediaState === 'playing') || players[0];
  }
  
  // Find Music Assistant equivalent for the active player
  const allPlayers = allMediaPlayers || players;
  if (activePlayerRaw) {
    const activeBaseId = activePlayerRaw.deviceId.replace('media_player.', '');
    const maEquivalent = allPlayers.find(p => 
      p.isMusicAssistant && (p.deviceId.includes(activeBaseId) || (p.title && activePlayerRaw.title && p.title.toLowerCase().includes(activePlayerRaw.title.toLowerCase())))
    );
    if (maEquivalent) {
      activePlayerRaw = maEquivalent;
    }
  }

  // Apply optimistic UI state for instant feedback
  const activePlayer = { ...activePlayerRaw, ...(optimisticState[activePlayerRaw?.deviceId] || {}) };

  const setOptimistic = (id, overrides) => {
    setOptimisticState(prev => ({ ...prev, [id]: overrides }));
    setTimeout(() => {
      setOptimisticState(prev => { const next = { ...prev }; delete next[id]; return next; });
    }, 4000);
  };

  useEffect(() => {
    let interval;
    if (activePlayerRaw && (activePlayerRaw.mediaState === 'playing') && activePlayerRaw.mediaDuration) {
      interval = setInterval(() => {
        if (isSeeking.current) return;
        if (!activePlayerRaw.mediaPositionUpdatedAt) return;
        const lastUpdated = new Date(activePlayerRaw.mediaPositionUpdatedAt).getTime();
        const elapsedSinceUpdate = (Date.now() - lastUpdated) / 1000;
        let pos = (activePlayerRaw.mediaPosition || 0) + elapsedSinceUpdate;
        if (pos > activePlayerRaw.mediaDuration) pos = activePlayerRaw.mediaDuration;
        setCurrentProgress(pos);
      }, 1000);
      
      // Initial set
      if (activePlayerRaw.mediaPositionUpdatedAt && !isSeeking.current) {
        const lastUpdated = new Date(activePlayerRaw.mediaPositionUpdatedAt).getTime();
        const elapsedSinceUpdate = (Date.now() - lastUpdated) / 1000;
        let pos = (activePlayerRaw.mediaPosition || 0) + elapsedSinceUpdate;
        setCurrentProgress(Math.min(pos, activePlayerRaw.mediaDuration));
      }
    } else if (!isSeeking.current) {
      setCurrentProgress(activePlayerRaw?.mediaPosition || 0);
    }
    return () => clearInterval(interval);
  }, [activePlayerRaw]);

  const formatTime = (seconds) => {
    if (!seconds || isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSeekChange = (e) => {
    const newPos = parseFloat(e.target.value);
    setCurrentProgress(newPos);
  };

  const handleSeekEnd = (e) => {
    isSeeking.current = false;
    const newPos = parseFloat(e.target.value);
    onCommand(activePlayer.deviceId, 'media_seek', { seek_position: newPos });
  };

  const handleSeekStart = () => {
    isSeeking.current = true;
  };

  const anyMaEntity = allPlayers.find(p => p.isMusicAssistant || p.deviceId.includes('mass_'));
  const commandTargetId = activePlayerRaw?.deviceId;
  const defaultBrowseEntity = anyMaEntity ? anyMaEntity.deviceId : activePlayerRaw?.deviceId;

  const broadcastCommand = (id, command, params) => {
    const targetId = (id === activePlayerRaw.deviceId) ? commandTargetId : id;
    if (command === 'media_next_track' || command === 'media_previous_track') {
      setOptimistic(activePlayerRaw.deviceId, { isBuffering: true });
    }
    onCommand(targetId, command, params);
  };

  const handlePlayPause = (e, id, mediaState) => {
    e.stopPropagation();
    if (mediaState === 'playing') {
      setOptimistic(id, { mediaState: 'paused' });
      broadcastCommand(id, 'media_pause');
    } else {
      setOptimistic(id, { mediaState: 'playing' });
      broadcastCommand(id, 'media_play');
    }
  };

  const handleVolume = (e, id, vol) => {
    e.stopPropagation();
    const v = parseInt(vol, 10);
    setOptimistic(id, { volume: v });
    if (id === activePlayerRaw.deviceId) {
      broadcastCommand(id, 'volume_set', { volume_level: v / 100 });
    } else {
      onCommand(id, 'volume_set', { volume_level: v / 100 });
    }
  };

  // --- Media Browser ---
  const browseMedia = (entityId, type, id) => {
    if (!socket) return;
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
  };

  const openLibrary = () => {
    // Find a valid Music Assistant player to use for browsing the shared library
    const maPlayer = players.find(p => p.isMusicAssistant) || activePlayerRaw;
    const entity = maPlayer?.deviceId || defaultBrowseEntity;
    setBrowseEntityId(entity);
    setMediaPath([{ title: 'Library', id: '', type: '' }]);
    setActiveTab('browse');
    setSearchQuery('');
    setSearchResults([]);
    browseMedia(entity, '', '');
    setShowMediaBrowser(true);
  };

  const handleMediaClick = (item) => {
    if (item.can_expand) {
      setMediaPath(prev => [...prev, { title: item.title, id: item.media_content_id, type: item.media_content_type }]);
      browseMedia(browseEntityId, item.media_content_type, item.media_content_id);
    } else if (item.can_play) {
      broadcastCommand(activePlayerRaw.deviceId, 'play_media', { 
        media_content_type: item.media_content_type, 
        media_content_id: item.media_content_id 
      });
      setShowMediaBrowser(false);
      setOptimistic(activePlayerRaw.deviceId, { 
        mediaTitle: item.title, 
        mediaArtist: 'Loading...', 
        mediaState: 'playing',
        isBuffering: true 
      });
    }
  };

  const handleBackPath = (index) => {
    const newPath = mediaPath.slice(0, index + 1);
    setMediaPath(newPath);
    const target = newPath[newPath.length - 1];
    browseMedia(browseEntityId, target.type, target.id);
  };

  // --- Search ---
  const handleSearch = useCallback((query) => {
    setSearchQuery(query);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!query.trim()) { setSearchResults([]); return; }
    
    searchTimeout.current = setTimeout(() => {
      if (!socket) return;
      setIsSearching(true);
      socket.emit('ha_search_media', { entity_id: browseEntityId || defaultBrowseEntity, query: query.trim() }, (response) => {
        setIsSearching(false);
        if (response && response.result) {
          setSearchResults(response.result.children || []);
        } else {
          setSearchResults([]);
        }
      });
    }, 400);
  }, [socket, browseEntityId, defaultBrowseEntity]);

  // Filter: only show music-related items at root level
  const filteredItems = mediaPath.length <= 1 
    ? mediaItems.filter(item => {
        const t = (item.title || '').toLowerCase();
        const mc = (item.media_class || '').toLowerCase();
        const isNonMusic = t.includes('camera') || t.includes('image') || t === 'image upload' || t.includes('ai generated');
        const isMusic = mc.includes('music') || mc.includes('playlist') || mc.includes('album') || 
                        mc.includes('artist') || mc.includes('track') || mc.includes('directory');
        return !isNonMusic || isMusic;
      })
    : mediaItems;

  const artUrl = proxyImg(activePlayer.albumArt);

  // --- Render a media card ---
  const renderMediaCard = (item, idx) => {
    const thumb = item.thumbnail ? proxyImg(item.thumbnail) : null;
    return (
      <div key={item.media_content_id || idx} onClick={() => handleMediaClick(item)}
        style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: '14px',
          padding: '12px',
          cursor: 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '10px',
          transition: 'all 0.25s cubic-bezier(.4,0,.2,1)',
          textAlign: 'center',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,163,115,0.1)'; e.currentTarget.style.borderColor = 'rgba(212,163,115,0.3)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.transform = 'translateY(0)'; }}
      >
        <div style={{
          width: '90px', height: '90px', borderRadius: item.can_expand ? '12px' : '50%',
          background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', boxShadow: '0 4px 16px rgba(0,0,0,0.3)', flexShrink: 0
        }}>
          {thumb ? (
            <img src={thumb} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="" onError={(e) => { e.target.style.display='none'; }} />
          ) : item.can_expand ? (
            <Folder size={28} color="#d4a373" />
          ) : (
            <Disc3 size={28} color="rgba(255,255,255,0.2)" />
          )}
        </div>
        <div style={{ width: '100%', minHeight: '36px' }}>
          <h4 style={{ margin: 0, fontSize: '0.8rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'rgba(255,255,255,0.9)' }}>
            {(() => {
              if ((item.media_class === 'track' || item.media_class === 'album') && item.title && item.title.includes(' - ')) {
                // Music Assistant returns "Artist - Song Name" or "Artist - Album". We want just the song/album name.
                return item.title.substring(item.title.indexOf(' - ') + 3);
              }
              return item.title;
            })()}
          </h4>
          {item.can_play && !item.can_expand && (
            <span style={{ fontSize: '0.7rem', color: '#d4a373', fontWeight: 600 }}>▶ Play</span>
          )}
          {item.can_expand && (
            <span style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)' }}>Browse →</span>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="music-deck-container animate-slide-up" style={{ marginBottom: '24px' }}>
      <div className="music-deck glass" style={{
        borderRadius: '24px',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {/* ── Hero Player ── */}
        <div className="active-player" style={{ 
          padding: '24px',
          display: 'flex',
          gap: '24px',
          alignItems: 'center',
          backgroundColor: '#1a140f',
          backgroundImage: artUrl ? `linear-gradient(to right, rgba(20,15,10,0.95), rgba(30,20,15,0.7)), url(${artUrl})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderBottom: players.length > 1 ? '1px solid rgba(255,255,255,0.05)' : 'none'
        }}>
          {/* Album Art */}
          <div style={{
            width: '120px', height: '120px', borderRadius: '16px', overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', flexShrink: 0,
            background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            {artUrl ? (
              <img src={artUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={(e) => { e.target.style.display='none'; }} />
            ) : (
              <Music size={40} color="rgba(255,255,255,0.2)" />
            )}
          </div>
          
          {/* Controls */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Track Info + Library Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h2 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 600, color: '#fff', textShadow: '0 2px 8px rgba(0,0,0,0.5)', opacity: activePlayer.isBuffering ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                  {activePlayer.mediaTitle || 'Not Playing'}
                </h2>
                <p style={{ margin: '4px 0 0', fontSize: '1rem', color: 'rgba(255,255,255,0.7)', opacity: activePlayer.isBuffering ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                  {activePlayer.mediaArtist || activePlayer.title}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={openLibrary}
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px 16px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', transition: 'all 0.2s', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,163,115,0.2)'; e.currentTarget.style.borderColor = 'rgba(212,163,115,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                >
                  <ListMusic size={16} /> Library
                </button>
                <button onClick={() => navigate('/music')}
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '8px', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', transition: 'all 0.2s', flexShrink: 0 }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(212,163,115,0.2)'; e.currentTarget.style.borderColor = 'rgba(212,163,115,0.4)'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                  title="Expand to Full Player"
                >
                  <Maximize2 size={16} />
                </button>
              </div>
            </div>
            
            {/* Progress Bar */}
            {(activePlayer.mediaState === 'playing' || activePlayer.mediaState === 'paused' || activePlayer.mediaDuration > 0) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', maxWidth: '400px' }}>
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', minWidth: '40px', textAlign: 'right' }}>
                  {formatTime(currentProgress)}
                </span>
                <input type="range" 
                  min="0" max={activePlayer.mediaDuration || 100} 
                  value={currentProgress || 0} 
                  onChange={handleSeekChange}
                  onMouseDown={handleSeekStart}
                  onMouseUp={handleSeekEnd}
                  onTouchStart={handleSeekStart}
                  onTouchEnd={handleSeekEnd}
                  style={{ flex: 1, accentColor: '#d4a373', height: '4px' }} 
                />
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', minWidth: '40px' }}>
                  {formatTime(activePlayer.mediaDuration)}
                </span>
              </div>
            )}
            
            {/* Transport Controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button onClick={(e) => { e.stopPropagation(); broadcastCommand(activePlayer.deviceId, 'media_previous_track'); }}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px', opacity: 0.7, transition: 'opacity 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
              >
                <SkipBack size={24} />
              </button>
              
              <button onClick={(e) => handlePlayPause(e, activePlayer.deviceId, activePlayer.mediaState)}
                style={{
                  background: activePlayer.mediaState === 'playing' ? 'rgba(212,163,115,0.2)' : 'rgba(255,255,255,0.1)',
                  border: `1px solid ${activePlayer.mediaState === 'playing' ? 'rgba(212,163,115,0.4)' : 'rgba(255,255,255,0.2)'}`,
                  color: '#fff', cursor: 'pointer', width: '56px', height: '56px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backdropFilter: 'blur(10px)', transition: 'all 0.2s'
                }}>
                {activePlayer.mediaState === 'playing' ? <Pause size={28} /> : <Play size={28} style={{ marginLeft: '4px' }} />}
              </button>
              
              <button onClick={(e) => { e.stopPropagation(); broadcastCommand(activePlayer.deviceId, 'media_next_track'); }}
                style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', padding: '8px', opacity: 0.7, transition: 'opacity 0.2s' }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.7}
              >
                <SkipForward size={24} />
              </button>

              {/* Volume */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flex: 1, maxWidth: '180px' }}>
                <Volume2 size={16} color="rgba(255,255,255,0.5)" />
                <input type="range" min="0" max="100" value={activePlayer.volume || 0} 
                  onChange={(e) => handleVolume(e, activePlayer.deviceId, e.target.value)}
                  style={{ width: '100%', accentColor: '#d4a373' }} />
                <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.5)', minWidth: '28px', textAlign: 'right' }}>{activePlayer.volume || 0}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Multi-Speaker Grid ── */}
        {players.length > 1 && (
          <div style={{ padding: '20px 24px', background: '#1a140f' }}>
            <h4 style={{ margin: '0 0 16px', fontSize: '0.9rem', textTransform: 'uppercase', letterSpacing: '1px', color: 'rgba(255,255,255,0.4)' }}>
              Speakers
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {players.map(p => (
                <div key={p.deviceId} onClick={() => setSelectedId(p.deviceId)}
                  style={{ 
                    background: activePlayer.deviceId === p.deviceId ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)', 
                    border: activePlayer.deviceId === p.deviceId ? '1px solid rgba(212,163,115,0.5)' : '1px solid rgba(255,255,255,0.05)',
                    borderRadius: '16px', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'space-between', cursor: 'pointer', transition: 'all 0.2s'
                  }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', overflow: 'hidden' }}>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: p.mediaState === 'playing' ? 'rgba(212,163,115,0.2)' : 'rgba(255,255,255,0.05)', color: p.mediaState === 'playing' ? '#d4a373' : 'rgba(255,255,255,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Volume2 size={14} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                      <span style={{ fontSize: '0.95rem', color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.title}</span>
                      <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.4)' }}>{p.mediaState === 'playing' ? p.mediaTitle || 'Playing' : p.mediaState || 'idle'}</span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <input type="range" min="0" max="100" value={p.volume || 0} 
                      onChange={(e) => handleVolume(e, p.deviceId, e.target.value)}
                      onClick={(e) => e.stopPropagation()} style={{ width: '80px', accentColor: '#d4a373' }} />
                    <button onClick={(e) => handlePlayPause(e, p.deviceId, p.mediaState)}
                      style={{ background: p.mediaState === 'playing' ? '#d4a373' : 'rgba(255,255,255,0.1)', color: p.mediaState === 'playing' ? '#000' : '#fff', border: 'none', borderRadius: '50%', width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                      {p.mediaState === 'playing' ? <Pause size={14} /> : <Play size={14} style={{ marginLeft: '2px' }} />}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── MEDIA BROWSER MODAL ── */}
      {showMediaBrowser && createPortal(
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.9)', backdropFilter: 'blur(15px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div style={{ width: '100%', maxWidth: '720px', height: '85vh', borderRadius: '24px', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#1a1a1e', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }}>
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#222228' }}>
              <h3 style={{ margin: 0, fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px' }}><ListMusic size={20} color="#d4a373" /> Music</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <button onClick={() => setShowMediaBrowser(false)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', width: '32px', height: '32px', borderRadius: '50%', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
              </div>
            </div>

            {/* Tabs: Browse | Search */}
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#1e1e22' }}>
              <button 
                onClick={() => setActiveTab('browse')} 
                style={{ 
                  flex: 1, padding: '12px', background: 'none', border: 'none', cursor: 'pointer',
                  color: activeTab === 'browse' ? '#d4a373' : 'rgba(255,255,255,0.5)',
                  borderBottom: activeTab === 'browse' ? '2px solid #d4a373' : '2px solid transparent',
                  fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  transition: 'all 0.2s'
                }}>
                <ListMusic size={16} /> Browse
              </button>
              <button 
                onClick={() => setActiveTab('search')} 
                style={{ 
                  flex: 1, padding: '12px', background: 'none', border: 'none', cursor: 'pointer',
                  color: activeTab === 'search' ? '#d4a373' : 'rgba(255,255,255,0.5)',
                  borderBottom: activeTab === 'search' ? '2px solid #d4a373' : '2px solid transparent',
                  fontSize: '0.9rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                  transition: 'all 0.2s'
                }}>
                <Search size={16} /> Search
              </button>
            </div>

            {/* ── BROWSE TAB ── */}
            {activeTab === 'browse' && (
              <>
                {/* Breadcrumb */}
                <div style={{ padding: '10px 24px', background: '#16161a', display: 'flex', alignItems: 'center', gap: '8px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                  {mediaPath.map((p, i) => (
                    <React.Fragment key={i}>
                      <button onClick={() => handleBackPath(i)} style={{ background: 'none', border: 'none', color: i === mediaPath.length - 1 ? '#d4a373' : 'rgba(255,255,255,0.5)', cursor: 'pointer', fontSize: '0.85rem', padding: 0 }}>
                        {p.title}
                      </button>
                      {i < mediaPath.length - 1 && <ChevronRight size={14} color="rgba(255,255,255,0.3)" />}
                    </React.Fragment>
                  ))}
                </div>

                {/* Browse Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#1a1a1e' }}>
                  {isBrowsing ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '12px' }}>
                      <Disc3 size={32} color="#d4a373" className="spin" />
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Loading...</span>
                    </div>
                  ) : filteredItems.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.4)' }}>No music found here.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '14px' }}>
                      {filteredItems.map((item, idx) => renderMediaCard(item, idx))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── SEARCH TAB ── */}
            {activeTab === 'search' && (
              <>
                {/* Search Input */}
                <div style={{ padding: '16px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', background: '#1e1e22' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', background: '#28282e', borderRadius: '14px', padding: '12px 16px', border: '1px solid rgba(255,255,255,0.1)' }}>
                    <Search size={18} color="rgba(255,255,255,0.4)" />
                    <input 
                      type="text"
                      placeholder="Search Apple Music, artists, albums..."
                      value={searchQuery}
                      onChange={(e) => handleSearch(e.target.value)}
                      autoFocus
                      style={{ 
                        flex: 1, background: 'transparent', border: 'none', outline: 'none',
                        color: '#fff', fontSize: '1rem', fontFamily: 'inherit'
                      }}
                    />
                    {searchQuery && (
                      <button onClick={() => { setSearchQuery(''); setSearchResults([]); }}
                        style={{ background: 'rgba(255,255,255,0.1)', border: 'none', borderRadius: '50%', width: '24px', height: '24px', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <X size={12} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Search Results */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px', background: '#1a1a1e' }}>
                  {isSearching ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px', gap: '12px' }}>
                      <Disc3 size={32} color="#d4a373" className="spin" />
                      <span style={{ color: 'rgba(255,255,255,0.5)' }}>Searching...</span>
                    </div>
                  ) : !searchQuery ? (
                    <div style={{ textAlign: 'center', padding: '60px 20px', color: 'rgba(255,255,255,0.3)' }}>
                      <Search size={48} color="rgba(255,255,255,0.1)" />
                      <p style={{ margin: '16px 0 0', fontSize: '1rem' }}>Search for any song, artist, or album</p>
                      <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'rgba(255,255,255,0.2)' }}>Results come from Apple Music via Music Assistant</p>
                    </div>
                  ) : searchResults.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px', color: 'rgba(255,255,255,0.4)' }}>No results found for "{searchQuery}"</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '14px' }}>
                      {searchResults.map((item, idx) => renderMediaCard(item, idx))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
