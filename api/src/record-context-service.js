import {
  RECORD_CONTEXT_CONFIRMATION_SCORE,
  RECORD_CONTEXT_HISTORY_LIMIT,
  RECORD_CONTEXT_MAX_RECENT_DETECTIONS,
  RECORD_CONTEXT_MAX_RECENT_TRACKS,
  RECORD_CONTEXT_MIN_CANDIDATE_SCORE,
} from "./record-context-constants.js";
import {
  chooseWinningCandidate,
  computeContextConfidence,
  detectionContradictsCandidate,
  isSequenceMatch,
  scoreWinningCandidateSwitch,
  scoreDetectionAgainstActiveCandidate,
  scoreReleaseCandidateFromDetection,
} from "./record-context-scoring.js";
import {
  normalizeArtistName,
  normalizeDurationSeconds,
  normalizeReleaseTitle,
  normalizeSecondaryTypes,
  normalizeTrackTitle,
} from "./record-context-normalizers.js";

function toTracklist(tracklist) {
  if (!Array.isArray(tracklist)) {
    return [];
  }

  return tracklist.map((track) => ({
    number: Number(track.number) || null,
    title: track.title || null,
    normalizedTitle: normalizeTrackTitle(track.title),
    durationSeconds: normalizeDurationSeconds(track.duration),
  }));
}

function toReleaseCandidates(result) {
  if (Array.isArray(result?.release_candidates) && result.release_candidates.length) {
    return result.release_candidates.map((candidate) => ({
      releaseId: candidate.release_id || candidate.id || null,
      releaseGroupId: candidate.release_group_id || null,
      title: candidate.title || null,
      normalizedTitle: normalizeReleaseTitle(candidate.title),
      artist: candidate.artist || result?.release?.artist || result?.recording?.artist || null,
      normalizedArtist: normalizeArtistName(candidate.artist || result?.release?.artist || result?.recording?.artist),
      releaseDate: candidate.date || null,
      releaseType: candidate.release_type || null,
      secondaryTypes: normalizeSecondaryTypes(candidate.secondary_types),
      latestTrackNumber: Number(candidate.track_number) || null,
      latestTrackTitle: result?.recording?.title || null,
      trackTotal: Number(candidate.track_total) || null,
      tracklist: toTracklist(candidate.tracklist),
      sequenceCapable: Boolean(candidate.sequence_capable ?? (candidate.tracklist?.length && candidate.track_number)),
    }));
  }

  if (!result?.release) {
    return [];
  }

  return [{
    releaseId: result.release.id || null,
    releaseGroupId: result.release.release_group_id || null,
    title: result.release.title || null,
    normalizedTitle: normalizeReleaseTitle(result.release.title),
    artist: result.release.artist || result.recording?.artist || null,
    normalizedArtist: normalizeArtistName(result.release.artist || result.recording?.artist),
    releaseDate: result.release.date || null,
    releaseType: result.release.release_type || null,
    secondaryTypes: normalizeSecondaryTypes(result.release.secondary_types),
    latestTrackNumber: Number(result.release.track_number) || null,
    latestTrackTitle: result.recording?.title || null,
    trackTotal: Array.isArray(result.release.tracklist) ? result.release.tracklist.length : null,
    tracklist: toTracklist(result.release.tracklist),
    sequenceCapable: Boolean(result.release.tracklist?.length && result.release.track_number),
  }];
}

function createCandidateFromRelease(releaseCandidate, detection) {
  const baseScore = scoreReleaseCandidateFromDetection(detection, releaseCandidate);

  return {
    ...releaseCandidate,
    score: baseScore,
    expectedNextTrackNumber: Number.isFinite(releaseCandidate.latestTrackNumber)
      ? releaseCandidate.latestTrackNumber + 1
      : null,
    expectedNextTrack: null,
    compatibleDetectionCount: 1,
    consecutiveSequenceCount: 0,
    lastMatchedAt: detection.detectedAt,
  };
}

function computeExpectedNextTrack(candidate) {
  if (!candidate || !Array.isArray(candidate.tracklist) || !Number.isFinite(candidate.latestTrackNumber)) {
    return null;
  }

  const expectedTrackNumber = candidate.latestTrackNumber + 1;
  const expectedTrack = candidate.tracklist.find((track) => track.number === expectedTrackNumber);

  if (!expectedTrack) {
    return null;
  }

  return {
    number: expectedTrack.number,
    title: expectedTrack.title,
  };
}

function mergeDetectionIntoCandidate(existingCandidate, releaseCandidate, detection, context) {
  const previousLatestTrackNumber = existingCandidate.latestTrackNumber;
  const nextCandidate = {
    ...existingCandidate,
    ...releaseCandidate,
    latestTrackNumber: releaseCandidate.latestTrackNumber ?? existingCandidate.latestTrackNumber,
    latestTrackTitle: detection.track.title,
    lastMatchedAt: detection.detectedAt,
  };

  const detectionScore = scoreDetectionAgainstActiveCandidate(detection, nextCandidate, context);
  const priorScore = existingCandidate.score || 0;
  nextCandidate.score = Math.round((priorScore * 0.35) + (detectionScore * 0.65));
  nextCandidate.compatibleDetectionCount = (existingCandidate.compatibleDetectionCount || 0) + 1;

  if (isSequenceMatch(previousLatestTrackNumber, nextCandidate.latestTrackNumber)) {
    nextCandidate.consecutiveSequenceCount = (existingCandidate.consecutiveSequenceCount || 0) + 1;
  } else {
    nextCandidate.consecutiveSequenceCount = 0;
  }

  nextCandidate.expectedNextTrackNumber = Number.isFinite(nextCandidate.latestTrackNumber)
    ? nextCandidate.latestTrackNumber + 1
    : null;
  nextCandidate.expectedNextTrack = computeExpectedNextTrack(nextCandidate);

  return nextCandidate;
}

function shouldDemoteConfirmedContext(context, winningCandidate) {
  if (context.state !== "confirmed") {
    return false;
  }

  if (!winningCandidate) {
    return true;
  }

  if (
    context.activeRelease?.releaseId
    && winningCandidate.releaseId
    && context.activeRelease.releaseId !== winningCandidate.releaseId
  ) {
    return scoreWinningCandidateSwitch(winningCandidate, context);
  }

  return detectionContradictsCandidate(null, winningCandidate, context);
}

function updateCandidateList(context, detection) {
  const nextCandidates = [...context.candidateReleases];
  const touchedReleaseIds = new Set();

  for (const releaseCandidate of detection.releaseCandidates) {
    if (releaseCandidate.releaseId) {
      touchedReleaseIds.add(releaseCandidate.releaseId);
    }

    const existingIndex = nextCandidates.findIndex((candidate) => candidate.releaseId === releaseCandidate.releaseId);

    if (existingIndex === -1) {
      const createdCandidate = createCandidateFromRelease(releaseCandidate, detection);
      createdCandidate.expectedNextTrack = computeExpectedNextTrack(createdCandidate);
      nextCandidates.push(createdCandidate);
      continue;
    }

    nextCandidates[existingIndex] = mergeDetectionIntoCandidate(
      nextCandidates[existingIndex],
      releaseCandidate,
      detection,
      context,
    );
  }

  for (const candidate of nextCandidates) {
    if (!candidate.releaseId || touchedReleaseIds.has(candidate.releaseId)) {
      continue;
    }

    candidate.score = Math.round((candidate.score || 0) * 0.55);
  }

  context.candidateReleases = nextCandidates
    .filter((candidate) => (candidate.score || 0) >= RECORD_CONTEXT_MIN_CANDIDATE_SCORE)
    .sort((left, right) => (right.score || 0) - (left.score || 0));
}

function pushRecentDetection(context, detection) {
  context.recentDetections.push({
    id: detection.id,
    detectedAt: detection.detectedAt,
    normalizedConfidence: detection.normalizedConfidence,
    source: detection.source,
  });

  context.recentDetections = context.recentDetections.slice(-RECORD_CONTEXT_MAX_RECENT_DETECTIONS);
}

function pushRecentTrack(context, detection, winningCandidate) {
  context.recentTracks.push({
    title: detection.track.title,
    artist: detection.track.artist,
    trackNumber: winningCandidate?.latestTrackNumber ?? null,
    detectedAt: detection.detectedAt,
  });

  context.recentTracks = context.recentTracks.slice(-RECORD_CONTEXT_MAX_RECENT_TRACKS);
}

function archiveContextToHistory(context) {
  if (!context.activeReleaseGroup && !context.activeRelease) {
    return;
  }

  context.history.push({
    releaseGroupId: context.activeReleaseGroup?.releaseGroupId || null,
    releaseGroupTitle: context.activeReleaseGroup?.title || null,
    releaseId: context.activeRelease?.releaseId || null,
    releaseTitle: context.activeRelease?.title || null,
    endedAt: new Date().toISOString(),
    finalConfidence: context.confidence,
  });

  context.history = context.history.slice(-RECORD_CONTEXT_HISTORY_LIMIT);
}

function promoteStateIfEligible(context, winningCandidate) {
  if (!winningCandidate) {
    context.state = "unlocked";
    context.displayState = null;
    context.confidence = 0;
    return;
  }

  context.confidence = computeContextConfidence(winningCandidate, context);
  context.state = "candidate";
  context.displayState = "likely";

  if (
    context.confidence >= RECORD_CONTEXT_CONFIRMATION_SCORE
    && (winningCandidate.consecutiveSequenceCount || 0) >= 1
  ) {
    context.state = "confirmed";
    context.displayState = "confirmed";
    context.confirmedAt ||= winningCandidate.lastMatchedAt;
    context.lastConfirmedSequence = {
      previousTrackNumber: winningCandidate.latestTrackNumber - 1,
      currentTrackNumber: winningCandidate.latestTrackNumber,
    };
  }
}

function demoteStateIfNeeded(context, winningCandidate) {
  if (context.state !== "confirmed") {
    return;
  }

  if (!shouldDemoteConfirmedContext(context, winningCandidate)) {
    return;
  }

  context.state = "candidate";
  context.displayState = "likely";
  context.confirmedAt = null;
  context.confidence = Math.min(context.confidence, RECORD_CONTEXT_CONFIRMATION_SCORE - 1);
}

export function createEmptyRecordContext() {
  return {
    state: "unlocked",
    displayState: null,
    confidence: 0,
    confirmedAt: null,
    lastUpdatedAt: null,
    activeReleaseGroup: null,
    activeRelease: null,
    candidateReleases: [],
    recentDetections: [],
    recentTracks: [],
    expectedNextTrack: null,
    lastConfirmedSequence: null,
    history: [],
  };
}

export function resetRecordContext(context) {
  archiveContextToHistory(context);

  context.state = "unlocked";
  context.displayState = null;
  context.confidence = 0;
  context.confirmedAt = null;
  context.lastUpdatedAt = null;
  context.activeReleaseGroup = null;
  context.activeRelease = null;
  context.candidateReleases = [];
  context.recentDetections = [];
  context.recentTracks = [];
  context.expectedNextTrack = null;
  context.lastConfirmedSequence = null;

  return context;
}

export function buildDetectionResult(recognitionResult) {
  const recording = recognitionResult?.recording || {};
  const detectedAt = new Date().toISOString();

  return {
    id: `det_${Date.now()}`,
    detectedAt,
    source: recognitionResult?.method || "unknown",
    normalizedConfidence: Number(recognitionResult?.confidence) || 60,
    track: {
      title: recording.title || null,
      normalizedTitle: normalizeTrackTitle(recording.title),
      artist: recording.artist || recognitionResult?.release?.artist || null,
      normalizedArtist: normalizeArtistName(recording.artist || recognitionResult?.release?.artist),
      recordingId: recording.id || null,
      durationSeconds: normalizeDurationSeconds(recording.duration),
    },
    releaseCandidates: toReleaseCandidates(recognitionResult),
    winningCandidateReleaseId: recognitionResult?.release?.id || null,
    debug: {
      sourceWeight: null,
      matchedBy: [],
      sequenceMatch: false,
      contradictionReason: null,
    },
  };
}

export function applyDetectionToRecordContext(context, detection) {
  if (!detection?.track?.title || !Array.isArray(detection.releaseCandidates) || !detection.releaseCandidates.length) {
    return context;
  }

  const previouslyConfirmedReleaseId = context.activeRelease?.releaseId || null;
  const previousExpectedNextTrack = context.expectedNextTrack;
  context.lastUpdatedAt = detection.detectedAt;

  updateCandidateList(context, detection);

  const winningCandidate = chooseWinningCandidate(context.candidateReleases);

  demoteStateIfNeeded(context, winningCandidate);
  promoteStateIfEligible(context, winningCandidate);

  context.activeRelease = winningCandidate
    ? {
        releaseId: winningCandidate.releaseId,
        title: winningCandidate.title,
        releaseDate: winningCandidate.releaseDate,
        releaseType: winningCandidate.releaseType,
        secondaryTypes: winningCandidate.secondaryTypes,
      }
    : null;

  context.activeReleaseGroup = winningCandidate
    ? {
        releaseGroupId: winningCandidate.releaseGroupId,
        title: winningCandidate.title,
        artist: winningCandidate.artist,
      }
    : null;

  if (winningCandidate?.expectedNextTrack) {
    context.expectedNextTrack = winningCandidate.expectedNextTrack;
  } else if (previouslyConfirmedReleaseId && previouslyConfirmedReleaseId !== winningCandidate?.releaseId) {
    context.expectedNextTrack = previousExpectedNextTrack;
  }

  pushRecentDetection(context, detection);
  pushRecentTrack(context, detection, winningCandidate);

  return context;
}

export function getPublicRecordContext(context) {
  return {
    state: context.state,
    display_state: context.displayState,
    confidence: context.confidence,
    release_group_title: context.activeReleaseGroup?.title || null,
    release_title: context.activeRelease?.title || null,
    expected_next_track: context.expectedNextTrack,
  };
}
