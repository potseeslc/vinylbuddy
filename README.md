# Vinyl Buddy

Vinyl Buddy is a self-hosted now-playing service for vinyl playback. A dedicated listener such as `vinylbuddy-listener` captures audio, the Vinyl Buddy server identifies the track, and the web app and Home Assistant display the result.

## Features

- **Headless Listener Support**: Works cleanly with dedicated listener hardware such as a Raspberry Pi
- **Continuous Audio Recognition**: Automatically identifies tracks as they play on your turntable
- **Shazam Integration**: Uses Shazam for accurate music recognition
- **Cover Art Display**: Shows album artwork when available
- **Record Context Awareness**: Tracks likely vs confirmed album context across consecutive detections
- **Expected Next Track**: Surfaces the next likely track once sequence is confirmed
- **Last.fm Scrobbling**: Automatically scrobble identified tracks to your Last.fm account (optional)
- **Self-Hosted**: Run the application on your own hardware for complete privacy
- **Docker Support**: Easy deployment using Docker containers
- **Kiosk Display Mode**: Clean, minimal display for album art and now-playing details

## Prerequisites

- Docker and Docker Compose installed on your system
- A listener source for audio capture, such as `vinylbuddy-listener` on a Raspberry Pi

## Quick Start with Docker Compose

1. Clone the repository:
```bash
git clone <repository-url>
cd vinylbuddy
```

2. Create a local environment file from the example:
```bash
cp .env.example .env
```

3. Edit `.env` and set at least `MUSICBRAINZ_CONTACT`.
4. Optional: set `VINYLBUDDY_SHARED_TOKEN` if you want to protect write and recognition endpoints.

5. Start the service:
```bash
docker-compose up -d
```

6. Access the display UI in your browser at http://localhost:3000

## Usage

1. Run a listener device such as [vinylbuddy-listener](https://github.com/potseeslc/vinylbuddy-listener) on your audio source
2. Open the Vinyl Buddy web interface in your browser at http://localhost:3000
3. The web app runs in kiosk mode and polls the now-playing API for the latest recognized track
4. View the identified album information, likely vs confirmed record context, and expected next track as each track plays
5. Home Assistant can consume the same now-playing data through the separate integration repo

## Technical Details

- **Frontend**: React-based kiosk-style now-playing display
- **Backend**: Node.js with Fastify framework
- **Audio Processing**: FFmpeg for audio conversion
- **Recognition Services**: 
  - Shazam for primary identification
  - MusicBrainz for metadata lookup
  - Cover Art Archive for album artwork

## API

Vinyl Buddy exposes a small HTTP API that other systems can poll safely, including Home Assistant.

Current endpoints:

- `GET /api/health`
- `GET /api/now_playing`
- `POST /api/clear_now_playing`

The now-playing payload is intentionally stable and includes:

- `state`
- `title`
- `artist`
- `album`
- `album_year`
- `duration`
- `image_url`
- `source`
- `updated_at`
- `record_context`

The `record_context` object adds lightweight album-session intelligence:

- `state`: `unlocked`, `candidate`, or `confirmed`
- `display_state`: UI-friendly state such as `likely` or `confirmed`
- `confidence`: normalized confidence score
- `release_group_title`
- `release_title`
- `expected_next_track`

Detailed examples and response shapes are documented in [API.md](/Users/colterwilson/Documents/vinylbuddy/API.md).

If `VINYLBUDDY_SHARED_TOKEN` is set, write and recognition endpoints require either:

- `Authorization: Bearer <token>`
- `X-VinylBuddy-Token: <token>`

Read-only endpoints such as `GET /api/health` and `GET /api/now_playing` stay open for dashboards and Home Assistant.

## Home Assistant

The Home Assistant integration now lives in its own repo:

- [vinylbuddy-homeassistant](https://github.com/potseeslc/vinylbuddy-homeassistant)

That integration uses Vinyl Buddy's now-playing API to expose a read-only `media_player` entity with track metadata and album art.

## Docker Images

Pre-built Docker images are available on Docker Hub:

```bash
# Pull the latest image
docker pull potseeslc/vinylbuddy:latest
```

Or use the included `docker-compose.yml` file with a local `.env` file to run the application.

## Building from Source

If you prefer to build from source:

1. Clone the repository
2. Navigate to the project directory
3. Start with Docker Compose:
```bash
docker-compose up -d
```

## Last.fm Scrobbling (Optional)

Vinyl Buddy can automatically scrobble identified tracks to your Last.fm account. To enable this feature:

### 1. Create a Last.fm API Account

1. Go to https://www.last.fm/api/account/create
2. Sign in with your Last.fm account
3. Fill in the application details:
   - **Application name**: Vinyl Buddy (or any name you prefer)
   - **Application description**: A vinyl record identification app that scrobbles to Last.fm
   - **Homepage**: https://github.com/potseeslc/vinylbuddy (or your preferred URL)
   - **Callback URL**: http://localhost:3000 (or leave blank)

4. Click "Save Changes"

### 2. Get Your API Credentials

After creating the application, you'll see:
- **API Key**
- **Shared Secret**

### 3. Configure Environment Variables

Set the following variables in your local `.env` file:

```dotenv
LASTFM_API_KEY=your_api_key_here
LASTFM_SECRET=your_shared_secret_here
LASTFM_USERNAME=your_lastfm_username
```

### 4. Get Your Session Key

The session key is required for scrobbling. To obtain it:

1. Build and start the container with your API credentials
2. Run the session key generator script:
   ```bash
   docker exec -it vinylbuddy node src/get-session-key.js
   ```
3. Visit the provided URL to authorize the application
4. After authorization, run the script with the token:
   ```bash
   docker exec -it vinylbuddy node src/get-session-key.js YOUR_TOKEN_HERE
   ```
5. Add the session key to your local `.env` file:
   ```dotenv
   LASTFM_SESSION_KEY=your_session_key_here
   ```

### 5. Restart the Container

After adding all credentials, restart the container:
```bash
docker-compose down && docker-compose up -d
```

When properly configured, Vinyl Buddy will automatically scrobble identified tracks to your Last.fm account as they are detected. The application includes deduplication logic to prevent the same track from being scrobbled multiple times within a 5-minute window.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, feature requests, or questions, please open an issue on the GitHub repository.

## Built with Goose

This project was developed with the help of [Goose](https://block.github.io/goose/) by Block, Inc. Goose is an open-source AI agent that helps developers build software more efficiently through intelligent automation and tool integration. The Vinyl Buddy application was created using Goose's capabilities for code generation, debugging, and documentation.
