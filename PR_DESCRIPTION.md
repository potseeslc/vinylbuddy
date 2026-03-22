## Summary

This PR hardens the public repository and cleans up the backend recognition flow.

It removes exposed credentials and tracked generated artifacts from the latest code, rewrites git history to scrub the previously committed secrets and bulky dependency/build directories, upgrades vulnerable dependencies, and refactors the API recognition logic into a dedicated service module.

## Security Changes

- Removed committed secrets from the working tree and switched runtime configuration to environment-based setup.
- Scrubbed the exposed AcoustID and Last.fm credentials from git history.
- Removed tracked `api/node_modules`, `web/node_modules`, `web/dist`, `.DS_Store`, and `api/src/.env` from git history.
- Added rate limiting to the heavy audio-processing endpoints.
- Replaced the vulnerable `lastfm` package with direct Last.fm API calls.
- Upgraded backend and frontend dependencies until `npm audit` was clean.

## Cleanup And Refactor

- Added `.env.example` and `.dockerignore`.
- Updated Docker Compose and README setup instructions to use local environment variables instead of checked-in values.
- Extracted fingerprint, metadata, and Shazam recognition logic into `api/src/recognition-service.js`.
- Reduced duplicated recognition code in `api/src/server.js`.

## Verification

- `node --check api/src/server.js`
- `node --check api/src/recognition-service.js`
- `node --check api/src/lastfm-service.js`
- `node --check api/src/get-session-key.js`
- `npm --prefix api audit --omit=dev --json`

## Follow-Up

- Rotate any credentials that were previously exposed publicly.
- Because history was rewritten, collaborators will need to re-sync their local clones against the rewritten remote history.
