import {
  applyDetectionToRecordContext,
  createEmptyRecordContext,
} from "./record-context-service.js";

function createReleaseCandidate({
  releaseId,
  releaseGroupId,
  title,
  artist,
  trackNumber,
  tracklist,
  candidateScore = 86,
}) {
  return {
    releaseId,
    releaseGroupId,
    title,
    artist,
    latestTrackNumber: trackNumber,
    latestTrackTitle: tracklist.find((track) => track.number === trackNumber)?.title || null,
    tracklist,
    sequenceCapable: true,
    candidateScore,
  };
}

function createDetection({
  id,
  title,
  artist,
  confidence,
  releaseCandidates,
}) {
  return {
    id,
    detectedAt: new Date().toISOString(),
    source: "simulation",
    normalizedConfidence: confidence,
    track: {
      title,
      artist,
    },
    releaseCandidates,
    debug: {},
  };
}

function printContext(label, context) {
  const nextTrack = context.expectedNextTrack
    ? `${context.expectedNextTrack.number || "?"}. ${context.expectedNextTrack.title}`
    : "none";

  console.log(`\n${label}`);
  console.log(`state=${context.state} display=${context.displayState} confidence=${context.confidence}`);
  console.log(`release=${context.activeRelease?.title || "none"} next=${nextTrack}`);
  console.log(`recent=${context.recentTracks.map((track) => track.trackNumber || "?" ).join(" -> ") || "none"}`);
}

const albumTracklist = [
  { number: 1, title: "Track One" },
  { number: 2, title: "Track Two" },
  { number: 3, title: "Track Three" },
  { number: 4, title: "Track Four" },
];

const compilationTracklist = [
  { number: 1, title: "Opening Theme" },
  { number: 2, title: "City Lights" },
  { number: 3, title: "Night Drive" },
  { number: 4, title: "Finale" },
];

function runOrderedAlbumScenario() {
  const context = createEmptyRecordContext();
  const releaseId = "release-a";
  const releaseGroupId = "group-a";

  const firstDetection = createDetection({
    id: "det-1",
    title: "Track One",
    artist: "Test Artist",
    confidence: 86,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId,
        releaseGroupId,
        title: "Test Record",
        artist: "Test Artist",
        trackNumber: 1,
        tracklist: albumTracklist,
      }),
    ],
  });

  const secondDetection = createDetection({
    id: "det-2",
    title: "Track Two",
    artist: "Test Artist",
    confidence: 88,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId,
        releaseGroupId,
        title: "Test Record",
        artist: "Test Artist",
        trackNumber: 2,
        tracklist: albumTracklist,
      }),
    ],
  });

  applyDetectionToRecordContext(context, firstDetection);
  printContext("After track 1", context);

  applyDetectionToRecordContext(context, secondDetection);
  printContext("After track 2", context);
}

function runMidAlbumScenario() {
  const context = createEmptyRecordContext();

  applyDetectionToRecordContext(context, createDetection({
    id: "det-mid-1",
    title: "Track Three",
    artist: "Test Artist",
    confidence: 84,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-a",
        releaseGroupId: "group-a",
        title: "Test Record",
        artist: "Test Artist",
        trackNumber: 3,
        tracklist: albumTracklist,
      }),
    ],
  }));

  printContext("Mid-album start", context);
}

function runContradictionScenario() {
  const context = createEmptyRecordContext();

  applyDetectionToRecordContext(context, createDetection({
    id: "det-a-1",
    title: "Track One",
    artist: "Test Artist",
    confidence: 86,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-a",
        releaseGroupId: "group-a",
        title: "Test Record",
        artist: "Test Artist",
        trackNumber: 1,
        tracklist: albumTracklist,
      }),
    ],
  }));

  applyDetectionToRecordContext(context, createDetection({
    id: "det-a-2",
    title: "Track Two",
    artist: "Test Artist",
    confidence: 88,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-a",
        releaseGroupId: "group-a",
        title: "Test Record",
        artist: "Test Artist",
        trackNumber: 2,
        tracklist: albumTracklist,
      }),
    ],
  }));

  printContext("Before contradiction", context);

  applyDetectionToRecordContext(context, createDetection({
    id: "det-b-1",
    title: "Other Song",
    artist: "Other Artist",
    confidence: 90,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-b",
        releaseGroupId: "group-b",
        title: "Other Record",
        artist: "Other Artist",
        trackNumber: 1,
        tracklist: [
          { number: 1, title: "Other Song" },
          { number: 2, title: "Second Song" },
        ],
      }),
    ],
  }));

  printContext("After contradiction", context);
}

function runRepeatTrackScenario() {
  const context = createEmptyRecordContext();

  applyDetectionToRecordContext(context, createDetection({
    id: "det-repeat-1",
    title: "Track One",
    artist: "Test Artist",
    confidence: 87,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-a",
        releaseGroupId: "group-a",
        title: "Test Record",
        artist: "Test Artist",
        trackNumber: 1,
        tracklist: albumTracklist,
      }),
    ],
  }));

  applyDetectionToRecordContext(context, createDetection({
    id: "det-repeat-2",
    title: "Track One",
    artist: "Test Artist",
    confidence: 89,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-a",
        releaseGroupId: "group-a",
        title: "Test Record",
        artist: "Test Artist",
        trackNumber: 1,
        tracklist: albumTracklist,
      }),
    ],
  }));

  printContext("Repeat track detection", context);
}

function runSkippedTrackScenario() {
  const context = createEmptyRecordContext();

  applyDetectionToRecordContext(context, createDetection({
    id: "det-skip-1",
    title: "Track One",
    artist: "Test Artist",
    confidence: 86,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-a",
        releaseGroupId: "group-a",
        title: "Test Record",
        artist: "Test Artist",
        trackNumber: 1,
        tracklist: albumTracklist,
      }),
    ],
  }));

  applyDetectionToRecordContext(context, createDetection({
    id: "det-skip-2",
    title: "Track Three",
    artist: "Test Artist",
    confidence: 87,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-a",
        releaseGroupId: "group-a",
        title: "Test Record",
        artist: "Test Artist",
        trackNumber: 3,
        tracklist: albumTracklist,
      }),
    ],
  }));

  printContext("Skipped track sequence", context);
}

function runCompilationScenario() {
  const context = createEmptyRecordContext();

  applyDetectionToRecordContext(context, createDetection({
    id: "det-comp-1",
    title: "Opening Theme",
    artist: "Artist One",
    confidence: 84,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-comp",
        releaseGroupId: "group-comp",
        title: "Movie Night Soundtrack",
        artist: "Various Artists",
        trackNumber: 1,
        tracklist: compilationTracklist,
        candidateScore: 82,
      }),
    ],
  }));

  applyDetectionToRecordContext(context, createDetection({
    id: "det-comp-2",
    title: "City Lights",
    artist: "Artist Two",
    confidence: 86,
    releaseCandidates: [
      createReleaseCandidate({
        releaseId: "release-comp",
        releaseGroupId: "group-comp",
        title: "Movie Night Soundtrack",
        artist: "Various Artists",
        trackNumber: 2,
        tracklist: compilationTracklist,
        candidateScore: 84,
      }),
    ],
  }));

  printContext("Compilation / soundtrack sequence", context);
}

console.log("Vinyl Buddy record-context simulation");
runOrderedAlbumScenario();
runMidAlbumScenario();
runContradictionScenario();
runRepeatTrackScenario();
runSkippedTrackScenario();
runCompilationScenario();
