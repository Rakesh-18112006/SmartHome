import { callService, cachedHaStates } from '../../integrations/homeassistant/ha-client.js';

const previousVolumes = new Map(); // entity_id -> volume level (0.0 to 1.0)
const crossfadeIntervals = new Map();

/**
 * Helper to find the media player for a given room name.
 * Assumes media players are mapped to a room in HA or the frontend.
 */
function getMediaPlayersForRoom(roomName) {
  const players = [];
  if (!roomName) return players;
  const targetRoom = roomName.toLowerCase();
  
  for (const [entityId, entity] of cachedHaStates.entries()) {
    if (entity.type === 'media_player' && entity.room && entity.room.toLowerCase() === targetRoom) {
      // Exclude group players if possible (usually they don't map to a single room, but just in case)
      if (!entityId.includes('group')) {
        players.push(entity);
      }
    }
  }
  return players;
}

/**
 * Handle a presence state change in a room.
 * @param {string} roomName - The name of the room.
 * @param {boolean} isPresent - True if presence is detected, false otherwise.
 */
export function handlePresenceChange(roomName, isPresent) {
  if (!roomName || roomName === 'Unassigned') return;
  
  const players = getMediaPlayersForRoom(roomName);
  if (!players || players.length === 0) return;

  for (const player of players) {
    const entityId = player.entity_id;
    // HA volumes from our mapper might be 0-100, HA API expects 0.0-1.0
    const currentVolume = player.volume !== undefined ? player.volume / 100 : 0;

    console.log(`[FollowMeAudio] Presence in ${roomName} is ${isPresent ? 'ON' : 'OFF'}. Speaker: ${entityId}, CurVol: ${currentVolume}`);

    if (isPresent) {
      // Fade up to previous volume or default to 30% if unknown
      let targetVol = previousVolumes.get(entityId) || 0.3;
      
      // Don't fade up if it's already playing loudly
      if (currentVolume >= targetVol && currentVolume > 0.05) {
        console.log(`[FollowMeAudio] ${entityId} is already at or above target volume.`);
        continue;
      }
      
      // Safety net so it's actually audible when it fades up
      if (targetVol < 0.1) targetVol = 0.3; 

      fadeVolume(entityId, currentVolume, targetVol, 2000);
    } else {
      // Fade down to 0
      if (currentVolume > 0.05) {
        // Remember the volume before we fade it out, so we can restore it later
        previousVolumes.set(entityId, currentVolume); 
      }
      fadeVolume(entityId, currentVolume, 0, 2000);
    }
  }
}

/**
 * Smoothly crossfade volume for an HA media player over a duration.
 */
function fadeVolume(entityId, startVol, endVol, durationMs) {
  // Clear any existing fades for this entity
  if (crossfadeIntervals.has(entityId)) {
    clearInterval(crossfadeIntervals.get(entityId));
  }

  // If already at target, do nothing but enforce the final state just in case
  if (Math.abs(startVol - endVol) < 0.02) {
    try {
      callService('media_player', 'volume_set', {
        entity_id: entityId,
        volume_level: Number(endVol.toFixed(2))
      });
    } catch (e) {
      console.error(`[FollowMeAudio] Force volume error:`, e.message);
    }
    return;
  }

  const steps = 10;
  const stepTime = Math.floor(durationMs / steps);
  const volumeDiff = endVol - startVol;
  const stepVol = volumeDiff / steps;
  let currentStep = 0;

  const interval = setInterval(async () => {
    currentStep++;
    let nextVol = startVol + (stepVol * currentStep);
    
    // Bounds check
    if (nextVol < 0) nextVol = 0;
    if (nextVol > 1) nextVol = 1;

    try {
      await callService('media_player', 'volume_set', {
        entity_id: entityId,
        volume_level: Number(nextVol.toFixed(2))
      });
    } catch (e) {
      console.error(`[FollowMeAudio] Failed to set volume for ${entityId}:`, e.message);
    }

    if (currentStep >= steps) {
      clearInterval(interval);
      crossfadeIntervals.delete(entityId);
    }
  }, stepTime);

  crossfadeIntervals.set(entityId, interval);
}
