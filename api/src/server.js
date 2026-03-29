import Fastify from "fastify";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import { v4 as uuidv4 } from "uuid";
import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { pipeline as streamPipeline } from 'stream';
// Import Last.fm service
import { scrobbleTrack, isLastFmConfigured } from './lastfm-service.js';
import { identifyByFingerprint, identifyByMetadata, identifyByShazam } from "./recognition-service.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execFilePromise = promisify(execFile);

const fastify = Fastify({ 
  logger: true,
  bodyLimit: (Number(process.env.MAX_UPLOAD_MB || "25")) * 1024 * 1024
});

// Configuration setup
const uploadsDir = path.join(__dirname, 'uploads');
const helperScript = path.join(__dirname, 'fpcalc-helper.sh');
const ACOUSTID_API_KEY = process.env.ACOUSTID_API_KEY || "";
const MUSICBRAINZ_CONTACT = process.env.MUSICBRAINZ_CONTACT || "";
const MUSICBRAINZ_USER_AGENT = MUSICBRAINZ_CONTACT
  ? `VinylBuddy/1.0 (${MUSICBRAINZ_CONTACT})`
  : "VinylBuddy/1.0 (https://github.com/potseeslc/vinylbuddy)";
const MIME_TYPE_TO_EXTENSION = {
  "audio/webm": "webm",
  "audio/webm;codecs=opus": "webm",
  "audio/ogg": "ogg",
  "audio/ogg;codecs=opus": "ogg",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "mp4",
  "audio/x-m4a": "m4a",
  "audio/flac": "flac",
  "audio/x-flac": "flac",
};
const NOW_PLAYING_RESET_AFTER_MS = Number(process.env.NOW_PLAYING_RESET_AFTER_MS || "900000");
const PORT = Number(process.env.PORT || "3000");
const nowPlayingState = {
  state: "idle",
  title: null,
  artist: null,
  album: null,
  album_year: null,
  duration: null,
  image_url: null,
  source: null,
  updated_at: null,
};

function resetNowPlaying(updatedAt = null) {
  nowPlayingState.state = "idle";
  nowPlayingState.title = null;
  nowPlayingState.artist = null;
  nowPlayingState.album = null;
  nowPlayingState.album_year = null;
  nowPlayingState.duration = null;
  nowPlayingState.image_url = null;
  nowPlayingState.source = null;
  nowPlayingState.updated_at = updatedAt;
}

// Ensure uploads directory exists
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

function sanitizeExtension(filename, mimetype) {
  const mimeExtension = MIME_TYPE_TO_EXTENSION[mimetype];
  if (mimeExtension) {
    return mimeExtension;
  }

  const rawExtension = path.extname(filename || "").replace(".", "").toLowerCase();
  if (/^[a-z0-9]{1,8}$/.test(rawExtension)) {
    return rawExtension;
  }

  return "webm";
}

async function persistUpload(part) {
  const fileId = uuidv4();
  const ext = sanitizeExtension(part.filename, part.mimetype);
  const filename = `${fileId}.${ext}`;
  const filepath = path.join(uploadsDir, filename);

  const fileStream = fs.createWriteStream(filepath);
  await promisify(streamPipeline)(part.file, fileStream);

  const stats = await fs.promises.stat(filepath);
  if (stats.size === 0) {
    await cleanupFiles([filepath]);
    const error = new Error("Empty audio file received");
    error.statusCode = 400;
    throw error;
  }

  return { fileId, filename, filepath, stats };
}

async function cleanupFiles(paths) {
  await Promise.all(paths.filter(Boolean).map(async (targetPath) => {
    try {
      await fs.promises.unlink(targetPath);
    } catch (error) {
      if (error.code !== "ENOENT") {
        fastify.log.warn(`Could not clean up file ${targetPath}: ${error.message}`);
      }
    }
  }));
}

async function convertToWav(inputPath, outputPath) {
  await execFilePromise("ffmpeg", [
    "-i", inputPath,
    "-acodec", "pcm_s16le",
    "-ar", "44100",
    "-ac", "2",
    outputPath,
    "-y",
  ]);
}

async function ensureWavFile(inputPath, fileId) {
  const isWavInput = path.extname(inputPath).toLowerCase() === ".wav";
  if (isWavInput) {
    return {
      wavFilepath: inputPath,
      cleanupPaths: [],
    };
  }

  const wavFilepath = path.join(uploadsDir, `${fileId}.wav`);
  await convertToWav(inputPath, wavFilepath);
  return {
    wavFilepath,
    cleanupPaths: [wavFilepath],
  };
}

async function generateFingerprint(wavPath, fingerprintPath) {
  await execFilePromise("sh", [helperScript, wavPath, fingerprintPath]);
}

function updateNowPlaying(result) {
  if (!result?.success) {
    return;
  }

  const recording = result.recording || {};
  const release = result.release || {};
  const updatedAt = new Date().toISOString();

  const rawDuration = Number(recording.duration);
  const durationSeconds = Number.isFinite(rawDuration) && rawDuration > 0
    ? (rawDuration > 1000 ? Math.floor(rawDuration / 1000) : Math.floor(rawDuration))
    : null;

  nowPlayingState.state = "playing";
  nowPlayingState.title = recording.title || null;
  nowPlayingState.artist = recording.artist || release.artist || null;
  nowPlayingState.album = release.title || null;
  nowPlayingState.album_year = release.date ? String(release.date).split("-")[0] : null;
  nowPlayingState.duration = durationSeconds;
  nowPlayingState.image_url = result.coverArtUrl || null;
  nowPlayingState.source = result.method || null;
  nowPlayingState.updated_at = updatedAt;
}

function getNowPlayingState() {
  if (!nowPlayingState.updated_at) {
    return { ...nowPlayingState };
  }

  const ageMs = Date.now() - Date.parse(nowPlayingState.updated_at);
  if (Number.isFinite(ageMs) && ageMs > NOW_PLAYING_RESET_AFTER_MS) {
    resetNowPlaying(nowPlayingState.updated_at);
  }

  return { ...nowPlayingState };
}

// Register JSON body parser
fastify.addContentTypeParser('application/json', { parseAs: 'string' }, function (req, body, done) {
  try {
    var json = JSON.parse(body);
    done(null, json);
  } catch (err) {
    err.statusCode = 400;
    done(err, undefined);
  }
});

fastify.register(multipart, {
  limits: {
    fileSize: (Number(process.env.MAX_UPLOAD_MB || "25")) * 1024 * 1024,
    files: 1,
  },
});

fastify.register(rateLimit, {
  global: false,
  errorResponseBuilder: () => ({
    success: false,
    error: "Too many requests",
    message: "Please wait a moment before sending another audio sample.",
  }),
});

const heavyRouteConfig = {
  config: {
    rateLimit: {
      max: 20,
      timeWindow: "1 minute",
    },
  },
};

// Health check endpoint
fastify.get("/api/health", async () => ({
  ok: true,
  service: "vinylbuddy",
  now_playing_reset_after_ms: NOW_PLAYING_RESET_AFTER_MS,
}));

fastify.get("/api/now_playing", async () => getNowPlayingState());

fastify.post("/api/clear_now_playing", async () => {
  resetNowPlaying(new Date().toISOString());
  return getNowPlayingState();
});

// Upload endpoint: expects multipart/form-data field name "audio"
fastify.post("/api/identify", heavyRouteConfig, async (req, reply) => {
  try {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "Missing file field 'audio'" });

    const { fileId, filename, filepath, stats } = await persistUpload(part);
    
    fastify.log.info(`Saved file: ${filename}, size: ${stats.size} bytes`);

    const { wavFilepath, cleanupPaths } = await ensureWavFile(filepath, fileId);
    
    fastify.log.info(`Converted to WAV: ${wavFilepath}`);

    const fingerprintFile = path.join(uploadsDir, `${fileId}.fingerprint`);
    await generateFingerprint(wavFilepath, fingerprintFile);
    
    fastify.log.info(`Generated fingerprint: ${fingerprintFile}`);
    const result = await identifyByFingerprint({
      fingerprintFile,
      acoustidApiKey: ACOUSTID_API_KEY,
      musicBrainzUserAgent: MUSICBRAINZ_USER_AGENT,
      logger: fastify.log,
    });

    await cleanupFiles([filepath, ...cleanupPaths, fingerprintFile]);

    if (!result.success) {
      return {
        ...result,
        received_bytes: stats.size,
        content_type: part.mimetype,
        filename: part.filename,
      };
    }

    updateNowPlaying(result);
    return result;
  } catch (error) {
    fastify.log.error(`Server error: ${error.message}`);
    if (error.statusCode === 400 && error.message === "Empty audio file received") {
      return reply.code(400).send({
        success: false,
        error: 'Empty audio file received',
        message: 'The recorded audio file is empty. Please make sure your microphone is working and try again.'
      });
    }
    return reply.code(500).send({ 
      success: false,
      error: 'Server error occurred during processing',
      message: error.message 
    });
  }
});

// New endpoint for metadata-based recognition
fastify.post("/api/identify-metadata", async (req, reply) => {
  try {
    const { artist, album, track } = req.body;
    if (!artist && !album && !track) {
      return reply.code(400).send({
        error: "At least one of artist, album, or track is required"
      });
    }

    const result = await identifyByMetadata({
      artist,
      album,
      track,
      musicBrainzUserAgent: MUSICBRAINZ_USER_AGENT,
      logger: fastify.log,
    });

    if (!result.success && result.error.startsWith("MusicBrainz lookup failed:")) {
      return reply.code(500).send(result);
    }

    updateNowPlaying(result);
    return result;
  } catch (error) {
    fastify.log.error(`Server error: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Server error occurred during processing',
      message: error.message
    });
  }
});

// Enhanced identification endpoint that tries both methods
fastify.post("/api/identify-hybrid", heavyRouteConfig, async (req, reply) => {
  try {
    let audioResult = null;
    let audioError = null;
    const part = await req.file();
    if (part) {
      try {
        const { fileId, filepath } = await persistUpload(part);
        const { wavFilepath, cleanupPaths } = await ensureWavFile(filepath, fileId);
        const fingerprintFile = path.join(uploadsDir, `${fileId}.fingerprint`);

        await generateFingerprint(wavFilepath, fingerprintFile);

        audioResult = await identifyByFingerprint({
          fingerprintFile,
          acoustidApiKey: ACOUSTID_API_KEY,
          musicBrainzUserAgent: MUSICBRAINZ_USER_AGENT,
          logger: fastify.log,
        });

        await cleanupFiles([filepath, ...cleanupPaths, fingerprintFile]);
      } catch (error) {
        fastify.log.error(`Audio processing error: ${error.message}`);
        audioError = error.message;
      }
    }

    const { artist_hint, album_hint, track_hint } = req.body;
    if ((!audioResult || !audioResult.success) && (artist_hint || album_hint || track_hint)) {
      const metadataResult = await identifyByMetadata({
        artist: artist_hint,
        album: album_hint,
        track: track_hint,
        musicBrainzUserAgent: MUSICBRAINZ_USER_AGENT,
        logger: fastify.log,
      });

      if (metadataResult.success) {
        updateNowPlaying(metadataResult);
        return {
          success: true,
          method: "hybrid",
          audio_result: audioResult,
          audio_error: audioError,
          metadata_result: metadataResult,
        };
      }
    }

    if (audioResult && audioResult.success) {
      updateNowPlaying(audioResult);
      return audioResult;
    }

    if (artist_hint || album_hint || track_hint) {
      const result = await identifyByMetadata({
        artist: artist_hint,
        album: album_hint,
        track: track_hint,
        musicBrainzUserAgent: MUSICBRAINZ_USER_AGENT,
        logger: fastify.log,
      });

      updateNowPlaying(result);
      return result;
    }

    return {
      success: false,
      method: "hybrid",
      error: "Both audio fingerprinting and metadata recognition failed",
      audio_result: audioResult,
      audio_error: audioError
    };
  } catch (error) {
    fastify.log.error(`Server error: ${error.message}`);
    return reply.code(500).send({
      success: false,
      error: 'Server error occurred during processing',
      message: error.message
    });
  }
});

// Fallback route for debugging
fastify.post("/api/debug-upload", heavyRouteConfig, async (req, reply) => {
  const part = await req.file();
  if (!part) return reply.code(400).send({ error: "Missing file field 'audio'" });

  // Read file into memory
  const chunks = [];
  for await (const chunk of part.file) chunks.push(chunk);
  const buf = Buffer.concat(chunks);

  return {
    received_bytes: buf.length,
    content_type: part.mimetype,
    filename: part.filename,
    note: "Upload works. Next step: ffmpeg -> fpcalc -> AcoustID -> MusicBrainz.",
  };
});

// New endpoint for Shazam recognition
fastify.post("/api/identify-shazam", heavyRouteConfig, async (req, reply) => {
  fastify.log.info("Shazam identification endpoint called");
  
  try {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "Missing file field 'audio'" });

    const { fileId, filename, filepath, stats } = await persistUpload(part);
    
    fastify.log.info(`Saved file: ${filename}, size: ${stats.size} bytes`);

    // Convert to WAV if needed using ffmpeg (Shazam works best with WAV)
    const { wavFilepath, cleanupPaths } = await ensureWavFile(filepath, fileId);
    
    fastify.log.info(`Converted to WAV for Shazam: ${wavFilepath}`);
    const result = await identifyByShazam({
      wavFilepath,
      isLastFmConfigured,
      scrobbleTrack,
      musicBrainzUserAgent: MUSICBRAINZ_USER_AGENT,
      logger: fastify.log,
    });

    await cleanupFiles([filepath, ...cleanupPaths]);
    updateNowPlaying(result);
    return result;
  } catch (error) {
    fastify.log.error(`Server error: ${error.message}`);
    if (error.statusCode === 400 && error.message === "Empty audio file received") {
      return reply.code(400).send({
        success: false,
        error: 'Empty audio file received',
        message: 'The recorded audio file is empty. Please make sure your microphone is working and try again.'
      });
    }
    return reply.code(500).send({ 
      success: false,
      error: 'Server error occurred during processing',
      message: error.message 
    });
  }
});

// Enhanced endpoint that uses ONLY Shazam for recognition
fastify.post("/api/identify-enhanced", heavyRouteConfig, async (req, reply) => {
  try {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "Missing file field 'audio'" });

    const { fileId, filename, filepath, stats } = await persistUpload(part);
    
    fastify.log.info(`Saved file: ${filename}, size: ${stats.size} bytes`);

    // Convert to WAV for Shazam (Shazam works best with WAV)
    const { wavFilepath, cleanupPaths } = await ensureWavFile(filepath, fileId);
    
    fastify.log.info(`Converted to WAV for Shazam: ${wavFilepath}`);
    const result = await identifyByShazam({
      wavFilepath,
      isLastFmConfigured,
      scrobbleTrack,
      musicBrainzUserAgent: MUSICBRAINZ_USER_AGENT,
      logger: fastify.log,
    });

    await cleanupFiles([filepath, ...cleanupPaths]);
    updateNowPlaying(result);
    return result;
    
  } catch (error) {
    fastify.log.error(`Server error: ${error.message}`);
    if (error.statusCode === 400 && error.message === "Empty audio file received") {
      return reply.code(400).send({
        success: false,
        error: 'Empty audio file received',
        message: 'The recorded audio file is empty. Please make sure your microphone is working and try again.'
      });
    }
    return reply.code(500).send({ 
      success: false,
      error: 'Server error occurred during processing',
      message: error.message 
    });
  }
});

// Serve static files (built frontend) AFTER all API routes
// Use a more specific approach to avoid conflicts with API routes
fastify.register(fastifyStatic, {
  root: path.join(__dirname, '..', 'web', 'dist'),
  prefix: '/',  // Serve all files from the root
  decorateReply: false,
  allowedPath: (pathName) => {
    // Don't serve static files for API routes
    return !pathName.startsWith('/api/');
  }
});

// Serve the main index.html file for the root route
fastify.get('/', (req, reply) => {
  const indexPath = path.join(__dirname, '..', 'web', 'dist', 'index.html');
  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      reply.code(500).send({ error: 'Failed to load frontend app' });
      return;
    }
    reply.type('text/html').send(data);
  });
});

// Serve favicon if it exists
fastify.get('/favicon.ico', (req, reply) => {
  const faviconPath = path.join(__dirname, '..', 'web', 'dist', 'favicon.ico');
  fs.access(faviconPath, fs.constants.F_OK, (err) => {
    if (err) {
      reply.code(404).send({ error: 'Not found' });
    } else {
      fs.readFile(faviconPath, (err, data) => {
        if (err) {
          reply.code(500).send({ error: 'Failed to read favicon' });
        } else {
          reply.type('image/x-icon').send(data);
        }
      });
    }
  });
});

// Custom 404 handler to properly handle API routes vs SPA routes
fastify.setNotFoundHandler((req, res) => {
  // For API routes, return 404
  if (req.url.startsWith('/api/')) {
    res.code(404).send({ error: 'Route not found' });
    return;
  }
  
  // For all other routes, serve the frontend app (SPA fallback)
  const indexPath = path.join(__dirname, '..', 'web', 'dist', 'index.html');
  fs.readFile(indexPath, 'utf8', (err, data) => {
    if (err) {
      res.code(500).send({ error: 'Failed to load frontend app' });
      return;
    }
    res.type('text/html').send(data);
  });
});

const start = async () => {
  try {
    await fastify.listen({ host: "0.0.0.0", port: PORT });
    console.log(`API server listening on port ${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
