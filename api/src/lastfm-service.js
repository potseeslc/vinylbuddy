import { LastFmNode } from 'lastfm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load configuration
const configPath = path.join(__dirname, '.env');
let config = {};

if (fs.existsSync(configPath)) {
  const configContent = fs.readFileSync(configPath, 'utf8');
  const lines = configContent.split('\n');
  for (const line of lines) {
    const [key, value] = line.split('=');
    if (key && value) {
      config[key.trim()] = value.trim();
    }
  }
}

// Check for environment variables (takes precedence over .env file)
const LASTFM_API_KEY = process.env.LASTFM_API_KEY || config.LASTFM_API_KEY;
const LASTFM_SECRET = process.env.LASTFM_SECRET || config.LASTFM_SECRET;
const LASTFM_USERNAME = process.env.LASTFM_USERNAME || config.LASTFM_USERNAME;
const LASTFM_SESSION_KEY = process.env.LASTFM_SESSION_KEY || config.LASTFM_SESSION_KEY;

// Keep track of recently scrobbled tracks to prevent duplicates
const recentlyScrobbled = new Map();
const SCROBBLE_DEDUPE_WINDOW = 5 * 60 * 1000; // 5 minutes in milliseconds

// Function to generate a unique key for a track
function getTrackKey(artist, track) {
  return `${artist.toLowerCase()}|${track.toLowerCase()}`;
}

// Function to clean up old entries from the recently scrobbled map
function cleanupRecentlyScrobbled() {
  const now = Date.now();
  for (const [key, timestamp] of recentlyScrobbled.entries()) {
    if (now - timestamp > SCROBBLE_DEDUPE_WINDOW) {
      recentlyScrobbled.delete(key);
    }
  }
}

console.log('Last.fm configuration check:', {
  hasApiKey: !!LASTFM_API_KEY,
  hasSecret: !!LASTFM_SECRET,
  hasUsername: !!LASTFM_USERNAME,
  hasSessionKey: !!LASTFM_SESSION_KEY,
  apiKey: LASTFM_API_KEY ? '[REDACTED]' : null,
  secret: LASTFM_SECRET ? '[REDACTED]' : null,
  username: LASTFM_USERNAME,
  sessionKey: LASTFM_SESSION_KEY ? '[REDACTED]' : null
});

// Initialize Last.fm client if credentials are provided
let lastfmClient = null;
if (LASTFM_API_KEY && LASTFM_SECRET && LASTFM_USERNAME) {
  console.log('Initializing Last.fm client...');
  const clientConfig = {
    api_key: LASTFM_API_KEY,
    secret: LASTFM_SECRET,
    username: LASTFM_USERNAME
  };
  
  // Add session key if available
  if (LASTFM_SESSION_KEY) {
    clientConfig.session_key = LASTFM_SESSION_KEY;
  }
  
  lastfmClient = new LastFmNode(clientConfig);
  console.log('Last.fm client initialized successfully');
} else {
  console.log('Last.fm client not initialized - missing configuration');
}

// Function to scrobble a track to Last.fm
export async function scrobbleTrack(artist, track, album = null, duration = null) {
  // Only proceed if Last.fm is configured
  if (!lastfmClient || !LASTFM_API_KEY || !LASTFM_SECRET || !LASTFM_USERNAME) {
    console.log('Last.fm not configured, skipping scrobble');
    return { success: false, message: 'Last.fm not configured' };
  }

  // Generate track key and check for duplicates
  const trackKey = getTrackKey(artist, track);
  const now = Date.now();
  
  // Clean up old entries
  cleanupRecentlyScrobbled();
  
  // Check if this track was recently scrobbled
  if (recentlyScrobbled.has(trackKey)) {
    const lastScrobbled = recentlyScrobbled.get(trackKey);
    if (now - lastScrobbled < SCROBBLE_DEDUPE_WINDOW) {
      console.log(`Skipping duplicate scrobble for ${artist} - ${track} (scrobbled ${Math.floor((now - lastScrobbled) / 1000)} seconds ago)`);
      return { success: true, message: 'Duplicate scrobble skipped', skipped: true };
    }
  }

  try {
    // For now, we'll use a fixed timestamp (current time)
    // In a real implementation, we'd track when the song started playing
    const timestamp = Math.floor(Date.now() / 1000);
    
    // Prepare the scrobble data
    const scrobbleData = {
      artist: artist,
      track: track,
      timestamp: timestamp
    };
    
    // Add optional fields if provided
    if (album) {
      scrobbleData.album = album;
    }
    
    // Last.fm requires either duration or track number for scrobbling
    // We'll add duration if available
    if (duration && duration > 0) {
      scrobbleData.duration = Math.floor(duration);
    }
    
    // Create a session with the session key if available
    let session;
    if (LASTFM_SESSION_KEY) {
      session = lastfmClient.session(LASTFM_USERNAME, LASTFM_SESSION_KEY);
    } else {
      console.log('Last.fm session key not available, cannot scrobble');
      return { success: false, message: 'Last.fm session key not available' };
    }
    
    console.log('Attempting to scrobble to Last.fm with data:', scrobbleData);
    
    // Perform the scrobble using the update method
    const result = await new Promise((resolve, reject) => {
      const update = lastfmClient.update('scrobble', session, scrobbleData);
      update.on('success', (data) => resolve(data));
      update.on('error', (error) => reject(error));
    });
    
    // Record this track as recently scrobbled
    recentlyScrobbled.set(trackKey, now);
    
    console.log(`Successfully scrobbled to Last.fm: ${artist} - ${track} from ${album || 'Unknown Album'}`);
    console.log('Scrobble result:', result);
    
    return { success: true, message: 'Track scrobbled to Last.fm', data: result };
  } catch (error) {
    console.error('Error scrobbling to Last.fm:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return { success: false, message: `Error scrobbling: ${error.message}`, error: error };
  }
}

// Function to update now playing status
export async function updateNowPlaying(artist, track, album = null, duration = null) {
  // Only proceed if Last.fm is configured
  if (!lastfmClient || !LASTFM_API_KEY || !LASTFM_SECRET || !LASTFM_USERNAME) {
    console.log('Last.fm not configured, skipping now playing update');
    return { success: false, message: 'Last.fm not configured' };
  }

  try {
    // Prepare the now playing data
    const nowPlayingData = {
      artist: artist,
      track: track
    };
    
    // Add optional fields if provided
    if (album) {
      nowPlayingData.album = album;
    }
    
    if (duration) {
      nowPlayingData.duration = duration;
    }
    
    // Create a session with the session key if available
    let session;
    if (LASTFM_SESSION_KEY) {
      session = lastfmClient.session(LASTFM_USERNAME, LASTFM_SESSION_KEY);
    } else {
      console.log('Last.fm session key not available, cannot update now playing');
      return { success: false, message: 'Last.fm session key not available' };
    }
    
    console.log('Attempting to update now playing on Last.fm with data:', nowPlayingData);
    
    // Update now playing status using the update method
    const result = await new Promise((resolve, reject) => {
      const update = lastfmClient.update('nowplaying', session, nowPlayingData);
      update.on('success', (data) => resolve(data));
      update.on('error', (error) => reject(error));
    });
    
    console.log(`Successfully updated now playing to Last.fm: ${artist} - ${track} from ${album || 'Unknown Album'}`);
    console.log('Now playing result:', result);
    
    return { success: true, message: 'Now playing status updated on Last.fm', data: result };
  } catch (error) {
    console.error('Error updating now playing on Last.fm:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    return { success: false, message: `Error updating now playing: ${error.message}`, error: error };
  }
}

// Export configuration status
export const isLastFmConfigured = !!lastfmClient && !!LASTFM_API_KEY && !!LASTFM_SECRET && !!LASTFM_USERNAME;
