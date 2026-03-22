import axios from 'axios';
import crypto from 'crypto';

const LASTFM_API_KEY = process.env.LASTFM_API_KEY;
const LASTFM_SECRET = process.env.LASTFM_SECRET;
const LASTFM_USERNAME = process.env.LASTFM_USERNAME;
const LASTFM_SESSION_KEY = process.env.LASTFM_SESSION_KEY;
const LASTFM_API_URL = 'https://ws.audioscrobbler.com/2.0/';

// Keep track of recently scrobbled tracks to prevent duplicates
const recentlyScrobbled = new Map();
const SCROBBLE_DEDUPE_WINDOW = 5 * 60 * 1000;

function getTrackKey(artist, track) {
  return `${artist.toLowerCase()}|${track.toLowerCase()}`;
}

function cleanupRecentlyScrobbled() {
  const now = Date.now();
  for (const [key, timestamp] of recentlyScrobbled.entries()) {
    if (now - timestamp > SCROBBLE_DEDUPE_WINDOW) {
      recentlyScrobbled.delete(key);
    }
  }
}

function signLastFmParams(params) {
  const signatureBase = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join('');

  return crypto
    .createHash('md5')
    .update(`${signatureBase}${LASTFM_SECRET}`)
    .digest('hex');
}

async function callLastFm(method, params) {
  if (!LASTFM_API_KEY || !LASTFM_SECRET || !LASTFM_USERNAME || !LASTFM_SESSION_KEY) {
    return { success: false, message: 'Last.fm not configured' };
  }

  const requestParams = {
    method,
    api_key: LASTFM_API_KEY,
    sk: LASTFM_SESSION_KEY,
    ...params,
  };

  requestParams.api_sig = signLastFmParams(requestParams);
  requestParams.format = 'json';

  const response = await axios.post(
    LASTFM_API_URL,
    new URLSearchParams(requestParams).toString(),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      timeout: 10000,
    },
  );

  return response.data;
}

export async function scrobbleTrack(artist, track, album = null, duration = null) {
  if (!LASTFM_API_KEY || !LASTFM_SECRET || !LASTFM_USERNAME || !LASTFM_SESSION_KEY) {
    console.log('Last.fm not configured, skipping scrobble');
    return { success: false, message: 'Last.fm not configured' };
  }

  const trackKey = getTrackKey(artist, track);
  const now = Date.now();
  cleanupRecentlyScrobbled();

  if (recentlyScrobbled.has(trackKey)) {
    const lastScrobbled = recentlyScrobbled.get(trackKey);
    if (now - lastScrobbled < SCROBBLE_DEDUPE_WINDOW) {
      console.log(`Skipping duplicate scrobble for ${artist} - ${track}`);
      return { success: true, message: 'Duplicate scrobble skipped', skipped: true };
    }
  }

  try {
    const payload = {
      artist,
      track,
      timestamp: Math.floor(Date.now() / 1000),
    };

    if (album) {
      payload.album = album;
    }

    if (duration && duration > 0) {
      payload.duration = Math.floor(duration);
    }

    const data = await callLastFm('track.scrobble', payload);
    recentlyScrobbled.set(trackKey, now);
    return { success: true, message: 'Track scrobbled to Last.fm', data };
  } catch (error) {
    console.error('Error scrobbling to Last.fm:', error.message);
    return { success: false, message: `Error scrobbling: ${error.message}` };
  }
}

export async function updateNowPlaying(artist, track, album = null, duration = null) {
  if (!LASTFM_API_KEY || !LASTFM_SECRET || !LASTFM_USERNAME || !LASTFM_SESSION_KEY) {
    console.log('Last.fm not configured, skipping now playing update');
    return { success: false, message: 'Last.fm not configured' };
  }

  try {
    const payload = { artist, track };

    if (album) {
      payload.album = album;
    }

    if (duration && duration > 0) {
      payload.duration = Math.floor(duration);
    }

    const data = await callLastFm('track.updateNowPlaying', payload);
    return { success: true, message: 'Now playing status updated on Last.fm', data };
  } catch (error) {
    console.error('Error updating now playing on Last.fm:', error.message);
    return { success: false, message: `Error updating now playing: ${error.message}` };
  }
}

export const isLastFmConfigured = Boolean(
  LASTFM_API_KEY && LASTFM_SECRET && LASTFM_USERNAME && LASTFM_SESSION_KEY,
);
