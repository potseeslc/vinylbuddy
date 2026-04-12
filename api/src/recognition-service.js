import axios from "axios";
import { Shazam } from "node-shazam";
import fs from "fs";

const shazam = new Shazam();

function buildMusicBrainzHeaders(userAgent) {
  return {
    "User-Agent": userAgent,
  };
}

function normalizeDurationSeconds(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  if (numericValue > 1000) {
    return Math.round(numericValue / 1000);
  }

  return Math.round(numericValue);
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function titlesRoughlyMatch(left, right) {
  const normalizedLeft = normalizeText(left);
  const normalizedRight = normalizeText(right);

  return Boolean(normalizedLeft)
    && Boolean(normalizedRight)
    && (
      normalizedLeft === normalizedRight
      || normalizedLeft.includes(normalizedRight)
      || normalizedRight.includes(normalizedLeft)
    );
}

export function parseFingerprintData(fingerprintData) {
  let fingerprint = "";
  let duration = 0;

  for (const line of fingerprintData.split("\n")) {
    if (line.startsWith("FINGERPRINT=")) {
      fingerprint = line.substring(12);
    } else if (line.startsWith("DURATION=")) {
      duration = parseFloat(line.substring(9));
    }
  }

  return { fingerprint, duration };
}

async function fetchCoverArt(releaseId, logger) {
  try {
    const coverArtResponse = await axios.get(`https://coverartarchive.org/release/${releaseId}`, {
      params: { fmt: "json" },
      timeout: 10000,
    });

    if (!coverArtResponse.data.images?.length) {
      return null;
    }

    const frontImage = coverArtResponse.data.images.find((image) => image.front);
    return frontImage?.image || coverArtResponse.data.images[0].image || null;
  } catch (error) {
    logger.warn(`Could not fetch cover art: ${error.message}`);
    return null;
  }
}

async function fetchReleaseDetails(releaseId, musicBrainzUserAgent) {
  const response = await axios.get(`https://musicbrainz.org/ws/2/release/${releaseId}`, {
    params: {
      fmt: "json",
      inc: "recordings+artist-credits+labels+release-groups",
    },
    headers: buildMusicBrainzHeaders(musicBrainzUserAgent),
    timeout: 10000,
  });

  return response.data;
}

function toReleaseResult(releaseDetails) {
  return {
    id: releaseDetails.id,
    title: releaseDetails.title,
    date: releaseDetails.date,
    country: releaseDetails.country,
    release_group_id: releaseDetails["release-group"]?.id || null,
    release_type: releaseDetails["release-group"]?.["primary-type"]?.toLowerCase() || null,
    secondary_types: releaseDetails["release-group"]?.["secondary-types"] || [],
    tracklist: releaseDetails.media?.[0]?.tracks?.map((track) => ({
      number: track.number,
      title: track.title,
      duration: track.length,
    })) || [],
    artist: releaseDetails["artist-credit"]?.map((credit) => credit.name).join(", ") || "Unknown Artist",
  };
}

function findTrackOnRelease(releaseDetails, trackTitle) {
  for (const medium of releaseDetails.media || []) {
    for (const track of medium.tracks || []) {
      if (titlesRoughlyMatch(track.title, trackTitle) || titlesRoughlyMatch(track.recording?.title, trackTitle)) {
        return {
          track,
          medium,
        };
      }
    }
  }

  return null;
}

function toReleaseCandidate(releaseDetails, recording, { candidateScore = null } = {}) {
  const matchedTrack = findTrackOnRelease(releaseDetails, recording?.title);

  return {
    release_id: releaseDetails.id,
    release_group_id: releaseDetails["release-group"]?.id || null,
    title: releaseDetails.title,
    artist: releaseDetails["artist-credit"]?.map((credit) => credit.name).join(", ") || "Unknown Artist",
    date: releaseDetails.date || null,
    release_type: releaseDetails["release-group"]?.["primary-type"]?.toLowerCase() || null,
    secondary_types: releaseDetails["release-group"]?.["secondary-types"] || [],
    track_number: matchedTrack?.track?.number ? Number(matchedTrack.track.number) : null,
    track_total: matchedTrack?.medium?.tracks?.length || releaseDetails.media?.[0]?.tracks?.length || null,
    tracklist: releaseDetails.media?.[0]?.tracks?.map((track) => ({
      number: track.number,
      title: track.title,
      duration: track.length,
    })) || [],
    sequence_capable: Boolean(matchedTrack?.track?.number),
    candidate_score: candidateScore,
  };
}

async function fetchReleaseCandidates(releases, recording, musicBrainzUserAgent, logger, maxCandidates = 3) {
  if (!Array.isArray(releases) || !releases.length) {
    return [];
  }

  const sortedReleases = [...releases]
    .sort((left, right) => {
      const leftDate = left.date || "";
      const rightDate = right.date || "";
      return rightDate.localeCompare(leftDate);
    })
    .slice(0, maxCandidates);

  const candidates = [];

  for (const release of sortedReleases) {
    try {
      const releaseDetails = await fetchReleaseDetails(release.id, musicBrainzUserAgent);
      candidates.push(toReleaseCandidate(releaseDetails, recording));
    } catch (error) {
      logger.warn(`Could not fetch release candidate ${release.id}: ${error.message}`);
    }
  }

  return candidates;
}

function computeResultConfidence(method, releaseCandidates = []) {
  const candidateCount = releaseCandidates.length;

  if (method === "fingerprint") {
    return candidateCount ? 90 : 75;
  }

  if (method === "shazam") {
    return candidateCount ? 85 : 70;
  }

  if (method === "metadata") {
    return candidateCount ? 75 : 60;
  }

  return 60;
}

async function searchMusicBrainzRecording({ artist, album, track, musicBrainzUserAgent }) {
  const queryParts = [];
  if (artist) queryParts.push(`artist:"${artist}"`);
  if (album) queryParts.push(`release:"${album}"`);
  if (track) queryParts.push(`recording:"${track}"`);

  const fallbackParts = [artist, track, album].filter(Boolean);
  const queries = [
    queryParts.join(" AND "),
    fallbackParts.join(" AND "),
    fallbackParts.join(" OR "),
  ].filter((query) => query.trim().length > 0);

  for (const query of queries) {
    const response = await axios.get("https://musicbrainz.org/ws/2/recording", {
      params: {
        query,
        fmt: "json",
        limit: 5,
      },
      headers: buildMusicBrainzHeaders(musicBrainzUserAgent),
      timeout: 10000,
    });

    const bestResult = response.data.recordings?.find((recording) => recording.releases?.length);
    if (bestResult) {
      return bestResult;
    }
  }

  return null;
}

async function enrichShazamResultWithMusicBrainz(result, musicBrainzUserAgent, logger) {
  const needsEnrichment = !result.release?.date
    || !normalizeDurationSeconds(result.recording?.duration)
    || !Array.isArray(result.release_candidates)
    || !result.release_candidates.length;

  if (!needsEnrichment) {
    return result;
  }

  try {
    const musicBrainzRecording = await searchMusicBrainzRecording({
      artist: result.recording?.artist,
      album: result.release?.title,
      track: result.recording?.title,
      musicBrainzUserAgent,
    });

    if (!musicBrainzRecording) {
      return result;
    }

    const releaseCandidate = musicBrainzRecording.releases?.find((release) => release.date) || musicBrainzRecording.releases?.[0];
    const releaseCandidates = await fetchReleaseCandidates(
      musicBrainzRecording.releases || [],
      {
        ...result.recording,
        title: result.recording?.title || musicBrainzRecording.title,
      },
      musicBrainzUserAgent,
      logger,
    );
    const winningCandidate = releaseCandidates[0] || null;

    return {
      ...result,
      recording: {
        ...result.recording,
        duration: normalizeDurationSeconds(result.recording?.duration) || normalizeDurationSeconds(musicBrainzRecording.length),
      },
      release: {
        ...result.release,
        id: winningCandidate?.release_id || result.release?.id || null,
        release_group_id: winningCandidate?.release_group_id || result.release?.release_group_id || null,
        title: result.release?.title || winningCandidate?.title || releaseCandidate?.title || null,
        date: result.release?.date || winningCandidate?.date || releaseCandidate?.date || null,
        artist:
          result.release?.artist ||
          musicBrainzRecording["artist-credit"]?.map((credit) => credit.name).join(", ") ||
          null,
        release_type: winningCandidate?.release_type || result.release?.release_type || null,
        secondary_types: winningCandidate?.secondary_types || result.release?.secondary_types || [],
        track_number: winningCandidate?.track_number || result.release?.track_number || null,
        tracklist: winningCandidate?.tracklist || result.release?.tracklist || [],
      },
      release_candidates: releaseCandidates,
      confidence: computeResultConfidence(result.method, releaseCandidates),
      coverArtUrl: result.coverArtUrl || null,
    };
  } catch (error) {
    logger.warn(`Could not enrich Shazam result with MusicBrainz: ${error.message}`);
    return result;
  }
}

export async function identifyByFingerprint({
  fingerprintFile,
  acoustidApiKey,
  musicBrainzUserAgent,
  logger,
}) {
  const fingerprintData = fs.readFileSync(fingerprintFile, "utf8");
  const { fingerprint, duration } = parseFingerprintData(fingerprintData);

  logger.info(`Fingerprint: ${fingerprint.substring(0, 50)}... Duration: ${duration}s`);

  if (!fingerprint || !acoustidApiKey) {
    return {
      success: false,
      error: "No fingerprint generated or AcoustID API key not configured",
      fingerprintGenerated: Boolean(fingerprint),
      durationMeasured: duration,
    };
  }

  try {
    const acoustidParams = {
      client: acoustidApiKey,
      duration: Math.round(duration),
      fingerprint,
      meta: "recordings+releases",
      format: "json",
    };

    logger.info({
      duration: acoustidParams.duration,
      hasFingerprint: Boolean(acoustidParams.fingerprint),
    }, "Calling AcoustID lookup");

    const acoustidResponse = await axios({
      method: "post",
      url: "https://api.acoustid.org/v2/lookup",
      data: new URLSearchParams(acoustidParams).toString(),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      timeout: 10000,
    });

    const results = acoustidResponse.data.results || [];
    const recordingsWithReleases = [];

    for (const result of results) {
      for (const recording of result.recordings || []) {
        if (recording.releases?.length) {
          recordingsWithReleases.push({
            recording,
            score: result.score || 0,
          });
        }
      }
    }

    recordingsWithReleases.sort((a, b) => b.score - a.score);

    if (!recordingsWithReleases.length) {
      return {
        success: false,
        method: "fingerprint",
        error: "No matching releases found",
        acoustidData: acoustidResponse.data,
        fingerprintGenerated: true,
        durationMeasured: duration,
      };
    }

    const bestRecording = recordingsWithReleases[0].recording;
    const bestRelease = bestRecording.releases[0];

    try {
      const releaseDetails = await fetchReleaseDetails(bestRelease.id, musicBrainzUserAgent);
      const releaseCandidates = await fetchReleaseCandidates(
        bestRecording.releases || [],
        bestRecording,
        musicBrainzUserAgent,
        logger,
      );
      const coverArtUrl = await fetchCoverArt(bestRelease.id, logger);

      return {
        success: true,
        method: "fingerprint",
        recording: {
          id: bestRecording.id,
          title: bestRecording.title,
          artist: bestRecording.artists?.map((artist) => artist.name).join(", ") || "Unknown Artist",
          duration: normalizeDurationSeconds(bestRecording.duration),
          artists: bestRecording.artists,
        },
        release: toReleaseResult(releaseDetails),
        release_candidates: releaseCandidates,
        confidence: computeResultConfidence("fingerprint", releaseCandidates),
        coverArtUrl,
        fingerprintGenerated: true,
        durationMeasured: duration,
      };
    } catch (error) {
      logger.error(`MusicBrainz error: ${error.message}`);
      return {
        success: false,
        method: "fingerprint",
        error: "Could not fetch detailed release information",
        acoustidData: acoustidResponse.data,
        fingerprintGenerated: true,
        durationMeasured: duration,
      };
    }
  } catch (error) {
    logger.error(`AcoustID error: ${error.message}`);

    if (error.response) {
      logger.error(`AcoustID error response: ${JSON.stringify(error.response.data)}`);
      logger.error(`AcoustID error status: ${error.response.status}`);
      logger.error(`AcoustID error headers: ${JSON.stringify(error.response.headers)}`);
    }

    return {
      success: false,
      method: "fingerprint",
      error: `AcoustID lookup failed: ${error.message}`,
      acoustidError: error.response?.data || null,
      fingerprintGenerated: true,
      durationMeasured: duration,
    };
  }
}

export async function identifyByMetadata({
  artist,
  album,
  track,
  musicBrainzUserAgent,
  logger,
}) {
  if (!artist && !album && !track) {
    return {
      success: false,
      method: "metadata",
      error: "At least one of artist, album, or track is required",
    };
  }

  const specificParts = [];
  if (artist) specificParts.push(`artist:"${artist}"`);
  if (album) specificParts.push(`release:"${album}"`);
  if (track) specificParts.push(`recording:"${track}"`);

  const mediumParts = [];
  if (artist) mediumParts.push(`artist:"${artist}"`);
  if (track) mediumParts.push(`recording:"${track}"`);

  const generalParts = [];
  if (artist) generalParts.push(artist);
  if (track) generalParts.push(track);
  if (album) generalParts.push(album);

  const queries = [
    specificParts.join(" AND "),
    mediumParts.join(" AND "),
    generalParts.join(" AND "),
    generalParts.join(" OR "),
  ].filter((query) => query.trim().length > 0);

  try {
    let bestResult = null;
    let bestScore = -1;

    for (const query of queries) {
      const response = await axios.get("https://musicbrainz.org/ws/2/recording", {
        params: {
          query,
          fmt: "json",
          limit: 10,
        },
        headers: buildMusicBrainzHeaders(musicBrainzUserAgent),
        timeout: 10000,
      });

      for (const recording of response.data.recordings || []) {
        let score = 0;

        if (artist && recording["artist-credit"]) {
          const artistNames = recording["artist-credit"].map((credit) => credit.name.toLowerCase());
          if (artistNames.some((name) => name.includes(artist.toLowerCase()) || artist.toLowerCase().includes(name))) {
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

        if (recording.releases?.length) {
          score += 5;

          if (album) {
            const albumMatches = recording.releases.filter((release) =>
              release.title?.toLowerCase().includes(album.toLowerCase()),
            );
            score += albumMatches.length;
          }

          const releaseDates = recording.releases
            .map((release) => release.date)
            .filter(Boolean)
            .sort();

          if (releaseDates.length) {
            const mostRecentYear = parseInt(releaseDates[releaseDates.length - 1].substring(0, 4), 10);
            if (mostRecentYear && mostRecentYear > new Date().getFullYear() - 20) {
              score += 3;
            }
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestResult = recording;
        }

        if (score >= 15) {
          break;
        }
      }

      if (bestScore >= 8) {
        break;
      }
    }

    if (!bestResult) {
      return {
        success: false,
        method: "metadata",
        error: "No matches found in MusicBrainz database",
      };
    }

    let releaseInfo = null;
    let releaseCandidates = [];
    let coverArtUrl = null;

    let sortedReleases = [];
    if (bestResult.releases) {
      sortedReleases = [...bestResult.releases]
        .filter((release) => release.date)
        .sort((a, b) => b.date.localeCompare(a.date));

      if (!sortedReleases.length) {
        sortedReleases = bestResult.releases;
      }
    }

    if (sortedReleases.length) {
      try {
        releaseInfo = await fetchReleaseDetails(sortedReleases[0].id, musicBrainzUserAgent);
        releaseCandidates = await fetchReleaseCandidates(
          sortedReleases,
          bestResult,
          musicBrainzUserAgent,
          logger,
        );
      } catch (error) {
        logger.warn(`Could not fetch release info: ${error.message}`);
      }

      coverArtUrl = await fetchCoverArt(sortedReleases[0].id, logger);
    }

    return {
      success: true,
      method: "metadata",
      recording: {
        id: bestResult.id,
        title: bestResult.title,
        artist: bestResult["artist-credit"]?.map((credit) => credit.name).join(", ") || "Unknown Artist",
        duration: normalizeDurationSeconds(bestResult.length),
      },
      release: releaseInfo
        ? {
            id: releaseInfo.id,
            title: releaseInfo.title,
            date: releaseInfo.date,
            release_group_id: releaseInfo["release-group"]?.id || null,
            release_type: releaseInfo["release-group"]?.["primary-type"]?.toLowerCase() || null,
            secondary_types: releaseInfo["release-group"]?.["secondary-types"] || [],
            track_number: findTrackOnRelease(releaseInfo, bestResult.title)?.track?.number
              ? Number(findTrackOnRelease(releaseInfo, bestResult.title).track.number)
              : null,
            tracklist: toReleaseResult(releaseInfo).tracklist,
            artist: releaseInfo["artist-credit"]?.map((credit) => credit.name).join(", ") || "Unknown Artist",
          }
        : null,
      release_candidates: releaseCandidates,
      confidence: computeResultConfidence("metadata", releaseCandidates),
      coverArtUrl,
    };
  } catch (error) {
    logger.error(`MusicBrainz error: ${error.message}`);
    return {
      success: false,
      method: "metadata",
      error: `MusicBrainz lookup failed: ${error.message}`,
    };
  }
}

export async function identifyByShazam({
  wavFilepath,
  isLastFmConfigured,
  scrobbleTrack,
  musicBrainzUserAgent,
  logger,
}) {
  try {
    const shazamResult = await shazam.recognise(wavFilepath);

    if (!shazamResult?.matches?.length || !shazamResult.track) {
      return {
        success: false,
        method: "shazam",
        error: "No matches found with Shazam",
      };
    }

    const trackInfo = shazamResult.track;
    const albumTitle =
      trackInfo.sections?.find((section) => section.type === "SONG")
        ?.metadata?.find((meta) => meta.title === "Album")?.text ||
      trackInfo.title ||
      "Unknown Album";

    const result = {
      success: true,
      method: "shazam",
      recording: {
        id: trackInfo.key || "unknown",
        title: trackInfo.title || "Unknown Title",
        artist: trackInfo.subtitle || "Unknown Artist",
        duration: normalizeDurationSeconds(trackInfo.duration),
      },
      release: {
        id: null,
        release_group_id: null,
        title: albumTitle,
        date: trackInfo.release_date || null,
        artist: trackInfo.subtitle || "Unknown Artist",
        release_type: null,
        secondary_types: [],
        track_number: null,
        tracklist: [],
      },
      release_candidates: [],
      confidence: computeResultConfidence("shazam", []),
      coverArtUrl: trackInfo.images?.coverart || null,
      shazamData: shazamResult,
    };

    const enrichedResult = await enrichShazamResultWithMusicBrainz(result, musicBrainzUserAgent, logger);

    if (isLastFmConfigured) {
      try {
        const scrobbleResult = await scrobbleTrack(
          trackInfo.subtitle || "Unknown Artist",
          trackInfo.title || "Unknown Title",
          albumTitle,
          normalizeDurationSeconds(trackInfo.duration) || 0,
        );

        logger.info("Scrobble result:", scrobbleResult);
      } catch (error) {
        logger.warn(`Failed to scrobble to Last.fm: ${error.message}`);
      }
    }

    return enrichedResult;
  } catch (error) {
    logger.error(`Shazam error: ${error.message}`);
    return {
      success: false,
      method: "shazam",
      error: `Shazam recognition failed: ${error.message}`,
    };
  }
}
