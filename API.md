# Vinyl Buddy API

Vinyl Buddy exposes a small HTTP API for health checks and now-playing consumers such as Home Assistant dashboards.

## `GET /api/health`

Use this endpoint for liveness checks and first-time integration validation.

Example response:

```json
{
  "ok": true,
  "service": "vinylbuddy",
  "now_playing_reset_after_ms": 900000,
  "auth_required_for_writes": false
}
```

## `GET /api/now_playing`

Returns the latest recognized track in a Home Assistant-friendly shape.

Example `playing` response:

```json
{
  "state": "playing",
  "title": "So What",
  "artist": "Miles Davis",
  "album": "Kind of Blue",
  "album_year": "1959",
  "duration": 545,
  "image_url": "https://coverartarchive.org/release/.../front",
  "source": "shazam",
  "updated_at": "2026-03-22T18:00:00Z"
}
```

Example `idle` response:

```json
{
  "state": "idle",
  "title": null,
  "artist": null,
  "album": null,
  "album_year": null,
  "duration": null,
  "image_url": null,
  "source": null,
  "updated_at": "2026-03-22T18:10:00Z"
}
```

Notes:

- `state` is `playing` after a successful identification and falls back to `idle` after `NOW_PLAYING_RESET_AFTER_MS`.
- `updated_at` is the timestamp of the last state change.
- `duration` is returned in whole seconds when known.

## `POST /api/clear_now_playing`

Clears the in-memory now-playing state and returns the resulting idle payload.

Example response:

```json
{
  "state": "idle",
  "title": null,
  "artist": null,
  "album": null,
  "album_year": null,
  "duration": null,
  "image_url": null,
  "source": null,
  "updated_at": "2026-03-22T18:15:00Z"
}
```

## Authentication

If `VINYLBUDDY_SHARED_TOKEN` is configured, write and recognition endpoints require one of these headers:

```http
Authorization: Bearer your-token
```

or

```http
X-VinylBuddy-Token: your-token
```

Read-only endpoints such as `GET /api/health` and `GET /api/now_playing` remain available without authentication so dashboards and Home Assistant can poll them.

## Environment Variables

- `PORT`: HTTP port for the API server. Defaults to `3000`.
- `MAX_UPLOAD_MB`: Maximum upload size for recognition endpoints. Defaults to `25`.
- `NOW_PLAYING_RESET_AFTER_MS`: How long now-playing data remains in the `playing` state before resetting to `idle`. Defaults to `900000`.
- `UPLOADS_DIR`: Temporary upload and processing directory. Defaults to `api/src/uploads` in local runs and can be set to `/app/uploads` in containers.
- `VINYLBUDDY_SHARED_TOKEN`: Optional shared token for write and recognition endpoints.
