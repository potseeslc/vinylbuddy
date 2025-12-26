import Fastify from "fastify";
import multipart from "@fastify/multipart";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { pipeline as streamPipeline } from 'stream';
// Import Shazam library
import { Shazam } from 'node-shazam';
const shazam = new Shazam();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const execPromise = promisify(exec);

const fastify = Fastify({ 
  logger: true,
  bodyLimit: (Number(process.env.MAX_UPLOAD_MB || "25")) * 1024 * 1024
});

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

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configuration file path
const configPath = path.join(__dirname, '.env');

// Load configuration
let config = {};
if (fs.existsSync(configPath)) {
  const envContent = fs.readFileSync(configPath, 'utf8');
  const lines = envContent.split('\n');
  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine && !trimmedLine.startsWith('#')) {
      const [key, value] = trimmedLine.split('=');
      if (key && value !== undefined) {
        config[key.trim()] = value.trim();
      }
    }
  }
}

// Override with environment variables if set (only for keys not already in config)
for (const key in process.env) {
  if (process.env[key] && !config[key]) {
    config[key] = process.env[key];
  }
}

// Health check endpoint
fastify.get("/health", async () => ({ ok: true }));

// Configuration endpoints
fastify.get("/config", async () => {
  return {
    musicbrainz_contact: !!config.MUSICBRAINZ_CONTACT
  };
});

fastify.post("/config", async (req, reply) => {
  try {
    const { musicbrainzContact } = req.body;
    
    // Validate input
    if (!musicbrainzContact) {
      return reply.code(400).send({ error: "MusicBrainz contact is required" });
    }
    
    // Update config
    config.MUSICBRAINZ_CONTACT = musicbrainzContact;
    
    // Save to file - only save the keys we care about
    let configContent = '';
    const configKeys = ['MUSICBRAINZ_CONTACT'];
    for (const key of configKeys) {
      if (config[key]) {
        configContent += `${key}=${config[key]}\n`;
      }
    }
    
    fs.writeFileSync(configPath, configContent);
    
    return {
      success: true,
      message: "Configuration updated successfully",
      config: {
        musicbrainz_contact: !!config.MUSICBRAINZ_CONTACT
      }
    };
  } catch (error) {
    fastify.log.error(`Config update error: ${error.message}`);
    return reply.code(500).send({ 
      success: false,
      error: 'Failed to update configuration',
      message: error.message 
    });
  }
});

// Upload endpoint: expects multipart/form-data field name "audio"
fastify.post("/identify", async (req, reply) => {
  try {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "Missing file field 'audio'" });

    // Generate unique filename
    const fileId = uuidv4();
    const ext = part.filename?.split('.').pop() || 'webm';
    const filename = `${fileId}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    
    // Save file to disk
    const fileStream = fs.createWriteStream(filepath);
    await promisify(streamPipeline)(part.file, fileStream);

    // Get file size
    const stats = fs.statSync(filepath);
    
    // Check if file is empty
    if (stats.size === 0) {
      fastify.log.warn(`Received empty file: ${filename}`);
      return reply.code(400).send({ 
        success: false, 
        error: 'Empty audio file received',
        message: 'The recorded audio file is empty. Please make sure your microphone is working and try again.' 
      });
    }
    
    fastify.log.info(`Saved file: ${filename}, size: ${stats.size} bytes`);

    // Convert to WAV if needed using ffmpeg
    const wavFilepath = path.join(uploadsDir, `${fileId}.wav`);
    await execPromise(`ffmpeg -i "${filepath}" -acodec pcm_s16le -ar 44100 -ac 2 "${wavFilepath}" -y`);
    
    fastify.log.info(`Converted to WAV: ${wavFilepath}`);

    // Generate fingerprint using fpcalc helper script
    const fingerprintFile = path.join(uploadsDir, `${fileId}.fingerprint`);
    const helperScript = path.join(__dirname, 'fpcalc-helper.sh');
    
    // Make sure the script is executable and run it
    await execPromise(`sh "${helperScript}" "${wavFilepath}" "${fingerprintFile}"`);
    
    fastify.log.info(`Generated fingerprint: ${fingerprintFile}`);

    // Read fingerprint data
    const fingerprintData = fs.readFileSync(fingerprintFile, 'utf8');
    let fingerprint = '';
    let duration = 0;
    
    // Parse fpcalc output
    const lines = fingerprintData.split('\n');
    for (const line of lines) {
      if (line.startsWith('FINGERPRINT=')) {
        fingerprint = line.substring(12); // Remove 'FINGERPRINT=' prefix
      } else if (line.startsWith('DURATION=')) {
        duration = parseFloat(line.substring(9)); // Remove 'DURATION=' prefix
      }
    }
    
    fastify.log.info(`Fingerprint: ${fingerprint.substring(0, 50)}... Duration: ${duration}s`);

    // If we have a valid fingerprint, query AcoustID
    if (fingerprint && (config.ACOUSTID_API_KEY || process.env.ACOUSTID_API_KEY)) {
      try {
        const acoustidParams = {
          client: config.ACOUSTID_API_KEY || process.env.ACOUSTID_API_KEY,
          duration: Math.round(duration),
          fingerprint: fingerprint,
          meta: 'recordings+releases',
          format: 'json'
        };
        
        fastify.log.info(`Calling AcoustID with params: ${JSON.stringify(acoustidParams)}`);
        
        // Use a more explicit approach for the API call
        const acoustidResponse = await axios({
          method: 'post',
          url: 'https://api.acoustid.org/v2/lookup',
          data: new URLSearchParams(acoustidParams).toString(),
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000 // 10 second timeout
        });
        
        fastify.log.info(`AcoustID response: ${JSON.stringify(acoustidResponse.data).substring(0, 200)}...`);
        
        // Process AcoustID results to find the best release
        const results = acoustidResponse.data.results || [];
        if (results.length > 0) {
          // Find recordings with releases
          const recordingsWithReleases = [];
          
          for (const result of results) {
            const recordings = result.recordings || [];
            for (const recording of recordings) {
              if (recording.releases && recording.releases.length > 0) {
                recordingsWithReleases.push({
                  recording,
                  score: result.score || 0
                });
              }
            }
          }
          
          // Sort by score and get the best recording
          recordingsWithReleases.sort((a, b) => b.score - a.score);
          
          if (recordingsWithReleases.length > 0) {
            const bestRecording = recordingsWithReleases[0].recording;
            const releases = bestRecording.releases;
            
            // Get the first release (you might want to implement a more sophisticated selection)
            const bestRelease = releases[0];
            
            // Get detailed release info from MusicBrainz
            try {
              const mbResponse = await axios.get(`https://musicbrainz.org/ws/2/release/${bestRelease.id}`, {
                params: {
                  fmt: 'json',
                  inc: 'recordings+artist-credits+labels+release-groups'
                },
                headers: {
                  'User-Agent': config.MUSICBRAINZ_CONTACT || process.env.MUSICBRAINZ_CONTACT || 'VinylNowPlaying/1.0 (https://github.com)'
                }
              });
              
              const releaseDetails = mbResponse.data;
              
              // Get cover art
              let coverArtUrl = null;
              try {
                const coverArtResponse = await axios.get(`https://coverartarchive.org/release/${bestRelease.id}`, {
                  params: { fmt: 'json' }
                });
                
                if (coverArtResponse.data.images && coverArtResponse.data.images.length > 0) {
                  // Get the front image
                  const frontImages = coverArtResponse.data.images.filter(img => img.front);
                  if (frontImages.length > 0) {
                    coverArtUrl = frontImages[0].image;
                  } else {
                    // Fallback to first image
                    coverArtUrl = coverArtResponse.data.images[0].image;
                  }
                }
              } catch (coverArtError) {
                fastify.log.warn(`Could not fetch cover art: ${coverArtError.message}`);
              }
              
              // Clean up files
              try {
                fs.unlinkSync(filepath);
                fs.unlinkSync(wavFilepath);
                fs.unlinkSync(fingerprintFile);
              } catch (cleanupError) {
                fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
              }
              
              return {
                success: true,
                recording: {
                  id: bestRecording.id,
                  title: bestRecording.title,
                  duration: bestRecording.duration,
                  artists: bestRecording.artists
                },
                release: {
                  id: releaseDetails.id,
                  title: releaseDetails.title,
                  date: releaseDetails.date,
                  country: releaseDetails.country,
                  tracklist: releaseDetails.media?.[0]?.tracks?.map(track => ({
                    number: track.number,
                    title: track.title,
                    duration: track.length
                  })) || [],
                  artist: releaseDetails['artist-credit']?.map(ac => ac.name).join(', ') || 'Unknown Artist'
                },
                coverArtUrl: coverArtUrl
              };
            } catch (mbError) {
              fastify.log.error(`MusicBrainz error: ${mbError.message}`);
              
              // Clean up files
              try {
                fs.unlinkSync(filepath);
                fs.unlinkSync(wavFilepath);
                fs.unlinkSync(fingerprintFile);
              } catch (cleanupError) {
                fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
              }
              
              return {
                success: false,
                error: 'Could not fetch detailed release information',
                acoustidData: acoustidResponse.data
              };
            }
          }
        }
        
        // Clean up files
        try {
          fs.unlinkSync(filepath);
          fs.unlinkSync(wavFilepath);
          fs.unlinkSync(fingerprintFile);
        } catch (cleanupError) {
          fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
        }
        
        return {
          success: false,
          error: 'No matching releases found',
          acoustidData: acoustidResponse.data
        };
      } catch (acoustidError) {
        fastify.log.error(`AcoustID error: ${acoustidError.message}`);
        
        // Log more details about the error
        if (acoustidError.response) {
          fastify.log.error(`AcoustID error response: ${JSON.stringify(acoustidError.response.data)}`);
          fastify.log.error(`AcoustID error status: ${acoustidError.response.status}`);
          fastify.log.error(`AcoustID error headers: ${JSON.stringify(acoustidError.response.headers)}`);
        }
        
        // Clean up files
        try {
          fs.unlinkSync(filepath);
          fs.unlinkSync(wavFilepath);
          fs.unlinkSync(fingerprintFile);
        } catch (cleanupError) {
          fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
        }
        
        return {
          success: false,
          error: `AcoustID lookup failed: ${acoustidError.message}`,
          acoustidError: acoustidError.response?.data || null
        };
      }
    } else {
      // Clean up files
      try {
        fs.unlinkSync(filepath);
        fs.unlinkSync(wavFilepath);
        if (fs.existsSync(fingerprintFile)) {
          fs.unlinkSync(fingerprintFile);
        }
      } catch (cleanupError) {
        fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
      }
      
      return {
        success: false,
        error: 'No fingerprint generated or AcoustID API key not configured',
        received_bytes: stats.size,
        content_type: part.mimetype,
        filename: part.filename,
        fingerprint_generated: !!fingerprint,
        duration_measured: duration
      };
    }
  } catch (error) {
    fastify.log.error(`Server error: ${error.message}`);
    return reply.code(500).send({ 
      success: false,
      error: 'Server error occurred during processing',
      message: error.message 
    });
  }
});

// New endpoint for metadata-based recognition
fastify.post("/identify-metadata", async (req, reply) => {
  try {
    const { artist, album, track } = req.body;
    
    if (!artist && !album && !track) {
      return reply.code(400).send({ 
        error: "At least one of artist, album, or track is required" 
      });
    }
    
    // Build MusicBrainz query with more specific matching
    const queryParts = [];
    
    // For more precise matching, we'll create multiple query variations
    // and try them in order of specificity
    
    // Most specific: exact match with all provided fields
    const specificParts = [];
    if (artist) specificParts.push(`artist:"${artist}"`);
    if (album) specificParts.push(`release:"${album}"`);
    if (track) specificParts.push(`recording:"${track}"`);
    
    // Medium specificity: match primary fields
    const mediumParts = [];
    if (artist) mediumParts.push(`artist:"${artist}"`);
    if (track) mediumParts.push(`recording:"${track}"`);
    
    // Less specific: search terms
    const generalParts = [];
    if (artist) generalParts.push(artist);
    if (track) generalParts.push(track);
    if (album) generalParts.push(album);
    
    // Try queries in order of specificity
    const queries = [
      specificParts.join(' AND '),  // Most specific
      mediumParts.join(' AND '),    // Medium specificity
      generalParts.join(' AND '),   // General search
      generalParts.join(' OR ')     // Broadest search
    ];
    
    // Remove empty queries
    const validQueries = queries.filter(q => q.trim().length > 0);
    
    try {
      let bestResult = null;
      let bestScore = -1;
      
      // Try each query until we find good results
      for (const queryString of validQueries) {
        if (!queryString) continue;
        
        const mbResponse = await axios.get('https://musicbrainz.org/ws/2/recording', {
          params: {
            query: queryString,
            fmt: 'json',
            limit: 10  // Get more results to choose from
          },
          headers: {
            'User-Agent': config.MUSICBRAINZ_CONTACT || process.env.MUSICBRAINZ_CONTACT || 'VinylNowPlaying/1.0 (https://github.com)'
          }
        });
        
        const data = mbResponse.data;
        
        if (data.count > 0 && data.recordings && data.recordings.length > 0) {
          // Score the results based on how well they match our criteria
          for (const recording of data.recordings) {
            let score = 0;
            
            // Score based on exact matches
            if (artist && recording['artist-credit']) {
              const artistNames = recording['artist-credit'].map(ac => ac.name.toLowerCase());
              if (artistNames.some(name => name.includes(artist.toLowerCase()) || artist.toLowerCase().includes(name))) {
                score += 10;
              }
            }
            
            if (track && recording.title) {
              const title = recording.title.toLowerCase();
              const trackSearch = track.toLowerCase();
              if (title === trackSearch || title.includes(trackSearch) || trackSearch.includes(title)) {
                score += 8;
              }
            }
            
            // Prefer recordings with releases
            if (recording.releases && recording.releases.length > 0) {
              score += 5;
              
              // Prefer releases that match album if provided
              if (album) {
                const albumMatches = recording.releases.filter(r => 
                  r.title && r.title.toLowerCase().includes(album.toLowerCase())
                );
                score += albumMatches.length;
              }
            }
            
            // Prefer more recent releases
            if (recording.releases && recording.releases.length > 0) {
              const releaseDates = recording.releases
                .map(r => r.date)
                .filter(d => d)
                .sort();
              if (releaseDates.length > 0) {
                const mostRecent = releaseDates[releaseDates.length - 1];
                // Prefer releases from the last 20 years
                const year = parseInt(mostRecent.substring(0, 4));
                if (year && year > (new Date().getFullYear() - 20)) {
                  score += 3;
                }
              }
            }
            
            if (score > bestScore) {
              bestScore = score;
              bestResult = recording;
            }
            
            // If we found a very good match, break early
            if (score >= 15) {
              bestResult = recording;
              break;
            }
          }
          
          // If we found a decent match, stop trying other queries
          if (bestScore >= 8) {
            break;
          }
        }
      }
      
      if (bestResult) {
        // Try to get release information
        let releaseInfo = null;
        let coverArtUrl = null;
        
        // Sort releases by date to get the most recent primary release
        let sortedReleases = [];
        if (bestResult.releases) {
          sortedReleases = [...bestResult.releases]
            .filter(r => r.date) // Only releases with dates
            .sort((a, b) => b.date.localeCompare(a.date)); // Most recent first
          
          // If no releases with dates, use all releases
          if (sortedReleases.length === 0) {
            sortedReleases = bestResult.releases;
          }
        }
        
        // Try to get info for the best release
        if (sortedReleases.length > 0) {
          const bestRelease = sortedReleases[0];
          
          try {
            const releaseResponse = await axios.get(`https://musicbrainz.org/ws/2/release/${bestRelease.id}`, {
              params: {
                fmt: 'json',
                inc: 'recordings+artist-credits+labels+release-groups'
              },
              headers: {
                'User-Agent': config.MUSICBRAINZ_CONTACT || process.env.MUSICBRAINZ_CONTACT || 'VinylNowPlaying/1.0 (https://github.com)'
              }
            });
            releaseInfo = releaseResponse.data;
          } catch (releaseError) {
            fastify.log.warn(`Could not fetch release info: ${releaseError.message}`);
          }
          
          // Get cover art
          try {
            const coverArtResponse = await axios.get(`https://coverartarchive.org/release/${bestRelease.id}`, {
              params: { fmt: 'json' }
            });
            
            if (coverArtResponse.data.images && coverArtResponse.data.images.length > 0) {
              // Get the front image
              const frontImages = coverArtResponse.data.images.filter(img => img.front);
              if (frontImages.length > 0) {
                coverArtUrl = frontImages[0].image;
              } else {
                // Fallback to first image
                coverArtUrl = coverArtResponse.data.images[0].image;
              }
            }
          } catch (coverArtError) {
            fastify.log.warn(`Could not fetch cover art: ${coverArtError.message}`);
          }
        }
        
        return {
          success: true,
          method: "metadata",
          recording: {
            id: bestResult.id,
            title: bestResult.title,
            artist: bestResult['artist-credit'] ? 
              bestResult['artist-credit'].map(ac => ac.name).join(', ') : 'Unknown Artist',
            duration: bestResult.length
          },
          release: releaseInfo ? {
            id: releaseInfo.id,
            title: releaseInfo.title,
            date: releaseInfo.date,
            artist: releaseInfo['artist-credit'] ? 
              releaseInfo['artist-credit'].map(ac => ac.name).join(', ') : 'Unknown Artist'
          } : null,
          coverArtUrl: coverArtUrl
        };
      } else {
        return {
          success: false,
          method: "metadata",
          error: "No matches found in MusicBrainz database"
        };
      }
    } catch (mbError) {
      fastify.log.error(`MusicBrainz error: ${mbError.message}`);
      return reply.code(500).send({
        success: false,
        method: "metadata",
        error: `MusicBrainz lookup failed: ${mbError.message}`
      });
    }
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
fastify.post("/identify-hybrid", async (req, reply) => {
  try {
    // First, try to process uploaded audio file (your existing method)
    let audioResult = null;
    let audioError = null;
    
    try {
      // We'll implement the audio processing part here
      // For now, we'll return the same result as the /identify endpoint
      // In a full implementation, you'd want to reuse your existing audio processing code
      
      const part = await req.file();
      if (part) {
        // Generate unique filename
        const fileId = uuidv4();
        const ext = part.filename?.split('.').pop() || 'webm';
        const filename = `${fileId}.${ext}`;
        const filepath = path.join(uploadsDir, filename);
        
        // Save file to disk
        const fileStream = fs.createWriteStream(filepath);
        await promisify(streamPipeline)(part.file, fileStream);

        // Get file size
        const stats = fs.statSync(filepath);
        
        // Check if file is empty
        if (stats.size === 0) {
          fastify.log.warn(`Received empty file: ${filename}`);
          audioError = 'Empty audio file received';
        } else {
          fastify.log.info(`Saved file: ${filename}, size: ${stats.size} bytes`);

          // Convert to WAV if needed using ffmpeg
          const wavFilepath = path.join(uploadsDir, `${fileId}.wav`);
          await execPromise(`ffmpeg -i "${filepath}" -acodec pcm_s16le -ar 44100 -ac 2 "${wavFilepath}" -y`);
          
          fastify.log.info(`Converted to WAV: ${wavFilepath}`);

          // Generate fingerprint using fpcalc helper script
          const fingerprintFile = path.join(uploadsDir, `${fileId}.fingerprint`);
          const helperScript = path.join(__dirname, 'fpcalc-helper.sh');
          
          // Make sure the script is executable and run it
          await execPromise(`sh "${helperScript}" "${wavFilepath}" "${fingerprintFile}"`);
          
          fastify.log.info(`Generated fingerprint: ${fingerprintFile}`);

          // Read fingerprint data
          const fingerprintData = fs.readFileSync(fingerprintFile, 'utf8');
          let fingerprint = '';
          let duration = 0;
          
          // Parse fpcalc output
          const lines = fingerprintData.split('\n');
          for (const line of lines) {
            if (line.startsWith('FINGERPRINT=')) {
              fingerprint = line.substring(12); // Remove 'FINGERPRINT=' prefix
            } else if (line.startsWith('DURATION=')) {
              duration = parseFloat(line.substring(9)); // Remove 'DURATION=' prefix
            }
          }
          
          fastify.log.info(`Fingerprint: ${fingerprint.substring(0, 50)}... Duration: ${duration}s`);

          // If we have a valid fingerprint, query AcoustID
          if (fingerprint && (config.ACOUSTID_API_KEY || process.env.ACOUSTID_API_KEY)) {
            try {
              const acoustidParams = {
                client: config.ACOUSTID_API_KEY || process.env.ACOUSTID_API_KEY,
                duration: Math.round(duration),
                fingerprint: fingerprint,
                meta: 'recordings+releases',
                format: 'json'
              };
              
              fastify.log.info(`Calling AcoustID with params: ${JSON.stringify(acoustidParams)}`);
              
              // Use a more explicit approach for the API call
              const acoustidResponse = await axios({
                method: 'post',
                url: 'https://api.acoustid.org/v2/lookup',
                data: new URLSearchParams(acoustidParams).toString(),
                headers: {
                  'Content-Type': 'application/x-www-form-urlencoded'
                },
                timeout: 10000 // 10 second timeout
              });
              
              fastify.log.info(`AcoustID response: ${JSON.stringify(acoustidResponse.data).substring(0, 200)}...`);
              
              // Process AcoustID results to find the best release
              const results = acoustidResponse.data.results || [];
              if (results.length > 0) {
                // Find recordings with releases
                const recordingsWithReleases = [];
                
                for (const result of results) {
                  const recordings = result.recordings || [];
                  for (const recording of recordings) {
                    if (recording.releases && recording.releases.length > 0) {
                      recordingsWithReleases.push({
                        recording,
                        score: result.score || 0
                      });
                    }
                  }
                }
                
                // Sort by score and get the best recording
                recordingsWithReleases.sort((a, b) => b.score - a.score);
                
                if (recordingsWithReleases.length > 0) {
                  const bestRecording = recordingsWithReleases[0].recording;
                  const releases = bestRecording.releases;
                  
                  // Get the first release (you might want to implement a more sophisticated selection)
                  const bestRelease = releases[0];
                  
                  // Get detailed release info from MusicBrainz
                  try {
                    const mbResponse = await axios.get(`https://musicbrainz.org/ws/2/release/${bestRelease.id}`, {
                      params: {
                        fmt: 'json',
                        inc: 'recordings+artist-credits+labels+release-groups'
                      },
                      headers: {
                        'User-Agent': config.MUSICBRAINZ_CONTACT || process.env.MUSICBRAINZ_CONTACT || 'VinylNowPlaying/1.0 (https://github.com)'
                      }
                    });
                    
                    const releaseDetails = mbResponse.data;
                    
                    // Get cover art
                    let coverArtUrl = null;
                    try {
                      const coverArtResponse = await axios.get(`https://coverartarchive.org/release/${bestRelease.id}`, {
                        params: { fmt: 'json' }
                      });
                      
                      if (coverArtResponse.data.images && coverArtResponse.data.images.length > 0) {
                        // Get the front image
                        const frontImages = coverArtResponse.data.images.filter(img => img.front);
                        if (frontImages.length > 0) {
                          coverArtUrl = frontImages[0].image;
                        } else {
                          // Fallback to first image
                          coverArtUrl = coverArtResponse.data.images[0].image;
                        }
                      }
                    } catch (coverArtError) {
                      fastify.log.warn(`Could not fetch cover art: ${coverArtError.message}`);
                    }
                    
                    // Clean up files
                    try {
                      fs.unlinkSync(filepath);
                      fs.unlinkSync(wavFilepath);
                      fs.unlinkSync(fingerprintFile);
                    } catch (cleanupError) {
                      fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
                    }
                    
                    audioResult = {
                      success: true,
                      method: "fingerprint",
                      recording: {
                        id: bestRecording.id,
                        title: bestRecording.title,
                        duration: bestRecording.duration,
                        artists: bestRecording.artists
                      },
                      release: {
                        id: releaseDetails.id,
                        title: releaseDetails.title,
                        date: releaseDetails.date,
                        country: releaseDetails.country,
                        tracklist: releaseDetails.media?.[0]?.tracks?.map(track => ({
                          number: track.number,
                          title: track.title,
                          duration: track.length
                        })) || [],
                        artist: releaseDetails['artist-credit']?.map(ac => ac.name).join(', ') || 'Unknown Artist'
                      },
                      coverArtUrl: coverArtUrl
                    };
                  } catch (mbError) {
                    fastify.log.error(`MusicBrainz error: ${mbError.message}`);
                    
                    // Clean up files
                    try {
                      fs.unlinkSync(filepath);
                      fs.unlinkSync(wavFilepath);
                      fs.unlinkSync(fingerprintFile);
                    } catch (cleanupError) {
                      fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
                    }
                    
                    audioResult = {
                      success: false,
                      method: "fingerprint",
                      error: 'Could not fetch detailed release information',
                      acoustidData: acoustidResponse.data
                    };
                  }
                } else {
                  // Clean up files
                  try {
                    fs.unlinkSync(filepath);
                    fs.unlinkSync(wavFilepath);
                    fs.unlinkSync(fingerprintFile);
                  } catch (cleanupError) {
                    fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
                  }
                  
                  audioResult = {
                    success: false,
                    method: "fingerprint",
                    error: 'No matching releases found',
                    acoustidData: acoustidResponse.data
                  };
                }
              } else {
                // Clean up files
                try {
                  fs.unlinkSync(filepath);
                  fs.unlinkSync(wavFilepath);
                  fs.unlinkSync(fingerprintFile);
                } catch (cleanupError) {
                  fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
                }
                
                audioResult = {
                  success: false,
                  method: "fingerprint",
                  error: 'No matching releases found',
                  acoustidData: acoustidResponse.data
                };
              }
            } catch (acoustidError) {
              fastify.log.error(`AcoustID error: ${acoustidError.message}`);
              
              // Log more details about the error
              if (acoustidError.response) {
                fastify.log.error(`AcoustID error response: ${JSON.stringify(acoustidError.response.data)}`);
                fastify.log.error(`AcoustID error status: ${acoustidError.response.status}`);
                fastify.log.error(`AcoustID error headers: ${JSON.stringify(acoustidError.response.headers)}`);
              }
              
              // Clean up files
              try {
                fs.unlinkSync(filepath);
                fs.unlinkSync(wavFilepath);
                fs.unlinkSync(fingerprintFile);
              } catch (cleanupError) {
                fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
              }
              
              audioResult = {
                success: false,
                method: "fingerprint",
                error: `AcoustID lookup failed: ${acoustidError.message}`,
                acoustidError: acoustidError.response?.data || null
              };
            }
          } else {
            // Clean up files
            try {
              fs.unlinkSync(filepath);
              fs.unlinkSync(wavFilepath);
              if (fs.existsSync(fingerprintFile)) {
                fs.unlinkSync(fingerprintFile);
              }
            } catch (cleanupError) {
              fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
            }
            
            audioResult = {
              success: false,
              method: "fingerprint",
              error: 'No fingerprint generated or AcoustID API key not configured',
              received_bytes: stats.size,
              content_type: part.mimetype,
              filename: part.filename,
              fingerprint_generated: !!fingerprint,
              duration_measured: duration
            };
          }
        }
      }
    } catch (error) {
      fastify.log.error(`Audio processing error: ${error.message}`);
      audioError = error.message;
    }
    
    // If audio processing failed or returned no matches, try metadata if hints are provided
    const { artist_hint, album_hint, track_hint } = req.body;
    
    if ((!audioResult || !audioResult.success) && (artist_hint || album_hint || track_hint)) {
      try {
        // Try metadata-based recognition
        const queryParts = [];
        if (artist_hint) queryParts.push(`artist:"${artist_hint}"`);
        if (album_hint) queryParts.push(`release:"${album_hint}"`);
        if (track_hint) queryParts.push(`recording:"${track_hint}"`);
        
        const queryString = queryParts.join(' AND ');
        
        const mbResponse = await axios.get('https://musicbrainz.org/ws/2/recording', {
          params: {
            query: queryString,
            fmt: 'json',
            limit: 5
          },
          headers: {
            'User-Agent': config.MUSICBRAINZ_CONTACT || process.env.MUSICBRAINZ_CONTACT || 'VinylNowPlaying/1.0 (https://github.com)'
          }
        });
        
        const data = mbResponse.data;
        
        if (data.count > 0 && data.recordings && data.recordings.length > 0) {
          // Get the best match
          const bestRecording = data.recordings[0];
          
          // Try to get release information
          let releaseInfo = null;
          let coverArtUrl = null;
          
          if (bestRecording.releases && bestRecording.releases.length > 0) {
            try {
              const releaseResponse = await axios.get(`https://musicbrainz.org/ws/2/release/${bestRecording.releases[0].id}`, {
                params: {
                  fmt: 'json',
                  inc: 'recordings+artist-credits+labels+release-groups'
                },
                headers: {
                  'User-Agent': config.MUSICBRAINZ_CONTACT || process.env.MUSICBRAINZ_CONTACT || 'VinylNowPlaying/1.0 (https://github.com)'
                }
              });
              releaseInfo = releaseResponse.data;
            } catch (releaseError) {
              fastify.log.warn(`Could not fetch release info: ${releaseError.message}`);
            }
            
            // Get cover art
            try {
              const coverArtResponse = await axios.get(`https://coverartarchive.org/release/${bestRecording.releases[0].id}`, {
                params: { fmt: 'json' }
              });
              
              if (coverArtResponse.data.images && coverArtResponse.data.images.length > 0) {
                // Get the front image
                const frontImages = coverArtResponse.data.images.filter(img => img.front);
                if (frontImages.length > 0) {
                  coverArtUrl = frontImages[0].image;
                } else {
                  // Fallback to first image
                  coverArtUrl = coverArtResponse.data.images[0].image;
                }
              }
            } catch (coverArtError) {
              fastify.log.warn(`Could not fetch cover art: ${coverArtError.message}`);
            }
          }
          
          return {
            success: true,
            method: "hybrid",
            audio_result: audioResult,
            audio_error: audioError,
            metadata_result: {
              success: true,
              method: "metadata",
              recording: {
                id: bestRecording.id,
                title: bestRecording.title,
                artist: bestRecording['artist-credit'] ? 
                  bestRecording['artist-credit'].map(ac => ac.name).join(', ') : 'Unknown Artist',
                duration: bestRecording.length
              },
              release: releaseInfo ? {
                id: releaseInfo.id,
                title: releaseInfo.title,
                date: releaseInfo.date,
                artist: releaseInfo['artist-credit'] ? 
                  releaseInfo['artist-credit'].map(ac => ac.name).join(', ') : 'Unknown Artist'
              } : null,
              coverArtUrl: coverArtUrl
            }
          };
        }
      } catch (metadataError) {
        fastify.log.warn(`Metadata processing failed: ${metadataError.message}`);
      }
    }
    
    // Return whatever result we have
    if (audioResult && audioResult.success) {
      return audioResult;
    }
    
    // If we have metadata hints but no audio result, return the metadata result
    if (artist_hint || album_hint || track_hint) {
      try {
        // Try metadata-based recognition as fallback
        const queryParts = [];
        if (artist_hint) queryParts.push(`artist:"${artist_hint}"`);
        if (album_hint) queryParts.push(`release:"${album_hint}"`);
        if (track_hint) queryParts.push(`recording:"${track_hint}"`);
        
        const queryString = queryParts.join(' AND ');
        
        const mbResponse = await axios.get('https://musicbrainz.org/ws/2/recording', {
          params: {
            query: queryString,
            fmt: 'json',
            limit: 5
          },
          headers: {
            'User-Agent': config.MUSICBRAINZ_CONTACT || process.env.MUSICBRAINZ_CONTACT || 'VinylNowPlaying/1.0 (https://github.com)'
          }
        });
        
        const data = mbResponse.data;
        
        if (data.count > 0 && data.recordings && data.recordings.length > 0) {
          // Get the best match
          const bestRecording = data.recordings[0];
          
          // Try to get release information
          let releaseInfo = null;
          let coverArtUrl = null;
          
          if (bestRecording.releases && bestRecording.releases.length > 0) {
            try {
              const releaseResponse = await axios.get(`https://musicbrainz.org/ws/2/release/${bestRecording.releases[0].id}`, {
                params: {
                  fmt: 'json',
                  inc: 'recordings+artist-credits+labels+release-groups'
                },
                headers: {
                  'User-Agent': config.MUSICBRAINZ_CONTACT || process.env.MUSICBRAINZ_CONTACT || 'VinylNowPlaying/1.0 (https://github.com)'
                }
              });
              releaseInfo = releaseResponse.data;
            } catch (releaseError) {
              fastify.log.warn(`Could not fetch release info: ${releaseError.message}`);
            }
            
            // Get cover art
            try {
              const coverArtResponse = await axios.get(`https://coverartarchive.org/release/${bestRecording.releases[0].id}`, {
                params: { fmt: 'json' }
              });
              
              if (coverArtResponse.data.images && coverArtResponse.data.images.length > 0) {
                // Get the front image
                const frontImages = coverArtResponse.data.images.filter(img => img.front);
                if (frontImages.length > 0) {
                  coverArtUrl = frontImages[0].image;
                } else {
                  // Fallback to first image
                  coverArtUrl = coverArtResponse.data.images[0].image;
                }
              }
            } catch (coverArtError) {
              fastify.log.warn(`Could not fetch cover art: ${coverArtError.message}`);
            }
          }
          
          return {
            success: true,
            method: "metadata",
            recording: {
              id: bestRecording.id,
              title: bestRecording.title,
              artist: bestRecording['artist-credit'] ? 
                bestRecording['artist-credit'].map(ac => ac.name).join(', ') : 'Unknown Artist',
              duration: bestRecording.length
            },
            release: releaseInfo ? {
              id: releaseInfo.id,
              title: releaseInfo.title,
              date: releaseInfo.date,
              artist: releaseInfo['artist-credit'] ? 
                releaseInfo['artist-credit'].map(ac => ac.name).join(', ') : 'Unknown Artist'
            } : null,
            coverArtUrl: coverArtUrl
          };
        }
      } catch (metadataError) {
        fastify.log.warn(`Metadata processing failed: ${metadataError.message}`);
      }
    }
    
    // If we get here, both methods failed
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
fastify.post("/debug-upload", async (req, reply) => {
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
fastify.post("/identify-shazam", async (req, reply) => {
  try {
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "Missing file field 'audio'" });

    // Generate unique filename
    const fileId = uuidv4();
    const ext = part.filename?.split('.').pop() || 'webm';
    const filename = `${fileId}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    
    // Save file to disk
    const fileStream = fs.createWriteStream(filepath);
    await promisify(streamPipeline)(part.file, fileStream);

    // Get file size
    const stats = fs.statSync(filepath);
    
    // Check if file is empty
    if (stats.size === 0) {
      fastify.log.warn(`Received empty file: ${filename}`);
      return reply.code(400).send({ 
        success: false, 
        error: 'Empty audio file received',
        message: 'The recorded audio file is empty. Please make sure your microphone is working and try again.' 
      });
    }
    
    fastify.log.info(`Saved file: ${filename}, size: ${stats.size} bytes`);

    // Convert to WAV if needed using ffmpeg (Shazam works best with WAV)
    const wavFilepath = path.join(uploadsDir, `${fileId}.wav`);
    await execPromise(`ffmpeg -i "${filepath}" -acodec pcm_s16le -ar 44100 -ac 2 "${wavFilepath}" -y`);
    
    fastify.log.info(`Converted to WAV for Shazam: ${wavFilepath}`);

    try {
      // Use Shazam to identify the track
      const shazamResult = await shazam.recognise(wavFilepath);
      
      // Clean up files
      try {
        fs.unlinkSync(filepath);
        fs.unlinkSync(wavFilepath);
      } catch (cleanupError) {
        fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
      }
      
      if (shazamResult && shazamResult.matches && shazamResult.matches.length > 0) {
        // Get the best match
        const bestMatch = shazamResult.matches[0];
        
        // Extract relevant information
        const trackInfo = shazamResult.track;
        
        if (trackInfo) {
          // Try to get album artwork if available
          let coverArtUrl = null;
          if (trackInfo.images && trackInfo.images.coverart) {
            coverArtUrl = trackInfo.images.coverart;
          }
          
          // Try to get release date if available
          let releaseDate = null;
          if (trackInfo.release_date) {
            releaseDate = trackInfo.release_date;
          }
          
          return {
            success: true,
            method: "shazam",
            recording: {
              id: trackInfo.key || 'unknown',
              title: trackInfo.title || 'Unknown Title',
              artist: trackInfo.subtitle || 'Unknown Artist',
              duration: trackInfo.duration || 0
            },
            release: {
              title: trackInfo.sections?.find(section => section.type === 'SONG')?.metadata?.find(meta => meta.title === 'Album')?.text || trackInfo.title || 'Unknown Album',
              date: releaseDate,
              artist: trackInfo.subtitle || 'Unknown Artist'
            },
            coverArtUrl: coverArtUrl,
            shazamData: shazamResult
          };
        }
      }
      
      return {
        success: false,
        method: "shazam",
        error: "No matches found with Shazam"
      };
    } catch (shazamError) {
      fastify.log.error(`Shazam error: ${shazamError.message}`);
      
      // Clean up files
      try {
        fs.unlinkSync(filepath);
        fs.unlinkSync(wavFilepath);
      } catch (cleanupError) {
        fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
      }
      
      return {
        success: false,
        method: "shazam",
        error: `Shazam recognition failed: ${shazamError.message}`
      };
    }
  } catch (error) {
    fastify.log.error(`Server error: ${error.message}`);
    return reply.code(500).send({ 
      success: false,
      error: 'Server error occurred during processing',
      message: error.message 
    });
  }
});

// Enhanced endpoint that uses ONLY Shazam for recognition
fastify.post("/identify-enhanced", async (req, reply) => {
  try {
    // Store the uploaded file for Shazam recognition
    const part = await req.file();
    if (!part) return reply.code(400).send({ error: "Missing file field 'audio'" });

    // Generate unique filename
    const fileId = uuidv4();
    const ext = part.filename?.split('.').pop() || 'webm';
    const filename = `${fileId}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    
    // Save file to disk
    const fileStream = fs.createWriteStream(filepath);
    await promisify(streamPipeline)(part.file, fileStream);

    // Get file size
    const stats = fs.statSync(filepath);
    
    // Check if file is empty
    if (stats.size === 0) {
      fastify.log.warn(`Received empty file: ${filename}`);
      return reply.code(400).send({ 
        success: false, 
        error: 'Empty audio file received',
        message: 'The recorded audio file is empty. Please make sure your microphone is working and try again.' 
      });
    }
    
    fastify.log.info(`Saved file: ${filename}, size: ${stats.size} bytes`);

    // Convert to WAV for Shazam (Shazam works best with WAV)
    const wavFilepath = path.join(uploadsDir, `${fileId}.wav`);
    await execPromise(`ffmpeg -i "${filepath}" -acodec pcm_s16le -ar 44100 -ac 2 "${wavFilepath}" -y`);
    
    fastify.log.info(`Converted to WAV for Shazam: ${wavFilepath}`);

    // Try Shazam recognition
    let result = null;
    
    try {
      fastify.log.info("Attempting Shazam recognition...");
      const shazamResult = await shazam.recognise(wavFilepath);
      
      if (shazamResult && shazamResult.matches && shazamResult.matches.length > 0) {
        const trackInfo = shazamResult.track;
        
        if (trackInfo) {
          let coverArtUrl = null;
          if (trackInfo.images && trackInfo.images.coverart) {
            coverArtUrl = trackInfo.images.coverart;
          }
          
          let releaseDate = null;
          if (trackInfo.release_date) {
            releaseDate = trackInfo.release_date;
          }
          
          result = {
            success: true,
            method: "shazam",
            recording: {
              id: trackInfo.key || 'unknown',
              title: trackInfo.title || 'Unknown Title',
              artist: trackInfo.subtitle || 'Unknown Artist',
              duration: trackInfo.duration || 0
            },
            release: {
              title: trackInfo.sections?.find(section => section.type === 'SONG')?.metadata?.find(meta => meta.title === 'Album')?.text || trackInfo.title || 'Unknown Album',
              date: releaseDate,
              artist: trackInfo.subtitle || 'Unknown Artist'
            },
            coverArtUrl: coverArtUrl,
            shazamData: shazamResult
          };
          
          fastify.log.info("Shazam recognition successful");
        }
      } else {
        result = {
          success: false,
          method: "shazam",
          error: "No matches found with Shazam"
        };
      }
    } catch (shazamError) {
      fastify.log.error(`Shazam error: ${shazamError.message}`);
      
      result = {
        success: false,
        method: "shazam",
        error: `Shazam recognition failed: ${shazamError.message}`
      };
    }
    
    // Clean up files
    try {
      fs.unlinkSync(filepath);
      fs.unlinkSync(wavFilepath);
    } catch (cleanupError) {
      fastify.log.warn(`Could not clean up files: ${cleanupError.message}`);
    }
    
    // Return the result
    return result || {
      success: false,
      error: "Shazam recognition failed"
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

const start = async () => {
  try {
    await fastify.listen({ host: "0.0.0.0", port: 3000 });
    console.log('API server listening on port 3000');
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
