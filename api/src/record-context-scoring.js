import { RECORD_CONTEXT_CONFIRMATION_SCORE } from "./record-context-constants.js";
import {
  artistsRoughlyMatch,
  isCompilationOrSoundtrack,
  normalizeTrackTitle,
  titlesRoughlyMatch,
} from "./record-context-normalizers.js";

export const SCORE_WEIGHTS = {
  exactReleaseMatch: 8,
  releaseGroupMatch: 5,
  incompatibleReleasePenalty: -22,
  trackNumberKnown: 6,
  expectedNextTrackMatch: 14,
  consecutiveSequenceMatch: 12,
  nonSequentialDetectionPenalty: -10,
  exactTrackTitleMatch: 8,
  artistMatch: 5,
  compilationArtistMismatchPenalty: -1,
  normalArtistMismatchPenalty: -5,
  trackMissingPenalty: -24,
  contradictionPenalty: -28,
};

export function isSequenceMatch(previousTrackNumber, currentTrackNumber) {
  if (!Number.isFinite(previousTrackNumber) || !Number.isFinite(currentTrackNumber)) {
    return false;
  }

  return currentTrackNumber === previousTrackNumber + 1;
}

export function isRepeatTrack(previousTrackNumber, currentTrackNumber) {
  if (!Number.isFinite(previousTrackNumber) || !Number.isFinite(currentTrackNumber)) {
    return false;
  }

  return previousTrackNumber === currentTrackNumber;
}

export function scoreReleaseCandidateFromDetection(detection, candidate) {
  let score = Number(candidate?.candidateScore ?? detection?.normalizedConfidence) || 0;
  score = Math.round(score * 0.72);
  const normalizedDetectionTitle = normalizeTrackTitle(detection?.track?.title);
  const normalizedCandidateTitle = normalizeTrackTitle(candidate?.latestTrackTitle || detection?.track?.title);

  if (titlesRoughlyMatch(normalizedDetectionTitle, normalizedCandidateTitle)) {
    score += SCORE_WEIGHTS.exactTrackTitleMatch;
  }

  if (Number.isFinite(candidate?.latestTrackNumber)) {
    score += SCORE_WEIGHTS.trackNumberKnown;
  }

  if (artistsRoughlyMatch(detection?.track?.artist, candidate?.artist)) {
    score += SCORE_WEIGHTS.artistMatch;
  } else if (detection?.track?.artist && candidate?.artist) {
    score += isCompilationOrSoundtrack(candidate)
      ? SCORE_WEIGHTS.compilationArtistMismatchPenalty
      : SCORE_WEIGHTS.normalArtistMismatchPenalty;
  }

  return clampConfidence(score);
}

export function scoreDetectionAgainstActiveCandidate(detection, candidate, context) {
  let score = scoreReleaseCandidateFromDetection(detection, candidate);
  const previousTrackNumber = context?.lastConfirmedSequence?.currentTrackNumber
    ?? context?.recentTracks?.at(-1)?.trackNumber;

  if (candidate?.releaseId && candidate?.releaseId === context?.activeRelease?.releaseId) {
    score += SCORE_WEIGHTS.exactReleaseMatch;
  } else if (context?.activeRelease?.releaseId && candidate?.releaseId) {
    score += SCORE_WEIGHTS.incompatibleReleasePenalty;
  }

  if (isSequenceMatch(previousTrackNumber, candidate?.latestTrackNumber)) {
    score += SCORE_WEIGHTS.consecutiveSequenceMatch;
  }

  if (candidate?.expectedNextTrack?.number === candidate?.latestTrackNumber) {
    score += SCORE_WEIGHTS.expectedNextTrackMatch;
  }

  if (candidate?.releaseGroupId && candidate?.releaseGroupId === context?.activeReleaseGroup?.releaseGroupId) {
    score += SCORE_WEIGHTS.releaseGroupMatch;
  }

  return clampConfidence(score);
}

export function detectionContradictsCandidate(_detection, candidate, context) {
  if (!candidate) {
    return false;
  }

  if (
    context?.activeRelease?.releaseId
    && candidate.releaseId
    && context.activeRelease.releaseId !== candidate.releaseId
  ) {
    return true;
  }

  if (
    context?.expectedNextTrack?.number
    && Number.isFinite(candidate.latestTrackNumber)
    && candidate.latestTrackNumber !== context.expectedNextTrack.number
    && !isRepeatTrack(context?.lastConfirmedSequence?.currentTrackNumber, candidate.latestTrackNumber)
  ) {
    return true;
  }

  const latestTrackNumber = candidate.latestTrackNumber;
  const previousTrackNumber = context?.lastConfirmedSequence?.currentTrackNumber
    ?? context?.recentTracks?.at(-1)?.trackNumber;

  if (Number.isFinite(previousTrackNumber) && Number.isFinite(latestTrackNumber)) {
    return latestTrackNumber < previousTrackNumber && !isRepeatTrack(previousTrackNumber, latestTrackNumber);
  }

  return false;
}

export function scoreWinningCandidateSwitch(winningCandidate, context) {
  if (!winningCandidate || context?.state !== "confirmed") {
    return false;
  }

  if (
    context.activeRelease?.releaseId
    && winningCandidate.releaseId
    && context.activeRelease.releaseId !== winningCandidate.releaseId
    && (winningCandidate.score || 0) >= RECORD_CONTEXT_CONFIRMATION_SCORE
  ) {
    return true;
  }

  return false;
}

export function chooseWinningCandidate(candidates) {
  if (!Array.isArray(candidates) || !candidates.length) {
    return null;
  }

  return [...candidates].sort((left, right) => (right.score || 0) - (left.score || 0))[0];
}

export function clampConfidence(value) {
  const numericValue = Number(value) || 0;
  return Math.max(0, Math.min(100, Math.round(numericValue)));
}

export function computeContextConfidence(winningCandidate, context) {
  if (!winningCandidate) {
    return 0;
  }

  let confidence = winningCandidate.score || 0;

  if ((winningCandidate.compatibleDetectionCount || 0) >= 2) {
    confidence += 6;
  }

  if (
    (winningCandidate.compatibleDetectionCount || 0) >= 2
    && (winningCandidate.consecutiveSequenceCount || 0) === 0
  ) {
    confidence += SCORE_WEIGHTS.nonSequentialDetectionPenalty;
  }

  if ((winningCandidate.consecutiveSequenceCount || 0) >= 2) {
    confidence = Math.max(confidence, RECORD_CONTEXT_CONFIRMATION_SCORE);
  }

  if (context?.state === "confirmed") {
    confidence += 4;
  }

  return clampConfidence(confidence);
}
