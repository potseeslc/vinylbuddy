function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

export function normalizeText(value) {
  if (typeof value !== "string") {
    return "";
  }

  return collapseWhitespace(value.toLowerCase());
}

export function stripVersionNoise(value) {
  return normalizeText(value)
    .replace(/\(([^)]*(remaster|mono|stereo|mix|version|edition|deluxe)[^)]*)\)/g, "")
    .replace(/\b(remaster(ed)?|mono|stereo|mix|version|edition|deluxe)\b/g, "")
    .replace(/\bfeat\.?\b.*$/g, "")
    .replace(/\bft\.?\b.*$/g, "")
    .replace(/\s*-\s*(\d{4}\s+)?(mix|version|remaster(ed)?)\b.*$/g, "")
    .trim();
}

export function normalizeTrackTitle(value) {
  return stripVersionNoise(value);
}

export function normalizeArtistName(value) {
  return normalizeText(value)
    .replace(/\bfeat\.?\b.*$/g, "")
    .replace(/\bft\.?\b.*$/g, "")
    .trim();
}

export function normalizeReleaseTitle(value) {
  return stripVersionNoise(value);
}

export function normalizeSecondaryTypes(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item))
    .filter(Boolean);
}

export function normalizeDurationSeconds(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue) || numericValue <= 0) {
    return null;
  }

  return numericValue > 1000 ? Math.round(numericValue / 1000) : Math.round(numericValue);
}

export function titlesRoughlyMatch(a, b) {
  const left = normalizeTrackTitle(a);
  const right = normalizeTrackTitle(b);
  return Boolean(left) && Boolean(right) && (left === right || left.includes(right) || right.includes(left));
}

export function artistsRoughlyMatch(a, b) {
  const left = normalizeArtistName(a);
  const right = normalizeArtistName(b);
  return Boolean(left) && Boolean(right) && (left === right || left.includes(right) || right.includes(left));
}

export function isCompilationOrSoundtrack(candidate) {
  const secondaryTypes = normalizeSecondaryTypes(candidate?.secondaryTypes);
  const normalizedArtist = normalizeArtistName(candidate?.artist);

  return secondaryTypes.includes("compilation")
    || secondaryTypes.includes("soundtrack")
    || normalizedArtist === "various artists";
}
