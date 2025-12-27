# Vinyl Buddy

Vinyl Buddy is a self-hosted web application that helps you identify vinyl records by continuously listening to music playing on your turntable and automatically matching it against music databases.

## Features

- **Continuous Audio Recognition**: Automatically identifies tracks as they play on your turntable
- **Shazam Integration**: Uses Shazam for accurate music recognition
- **Cover Art Display**: Shows album artwork when available
- **Last.fm Scrobbling**: Automatically scrobble identified tracks to your Last.fm account (optional)
- **Self-Hosted**: Run the application on your own hardware for complete privacy
- **Docker Support**: Easy deployment using Docker containers
- **Simplified Interface**: Clean, minimal interface focused on continuous music detection
- **Privacy Protection**: Automatically returns to initial screen after 5 minutes of inactivity

## Prerequisites

- Docker and Docker Compose installed on your system
- Microphone access (built-in or external)

## Quick Start with Docker Compose

1. Clone the repository:
```bash
git clone <repository-url>
cd vinyl-now-playing
```

2. Start the service:
```bash
docker-compose up -d
```

3. Access the application in your browser at http://localhost:8081

## Usage

1. Open the Vinyl Buddy web interface in your browser at http://localhost:8081
2. Click the record player icon to start continuous listening mode
3. The application will automatically request microphone access
4. Start playing music on your turntable
5. Vinyl Buddy will automatically detect and display track information
6. View the identified album information and cover art as each track plays
7. For privacy protection, the app will automatically return to the initial screen after 5 minutes of inactivity (no music detected)
8. To resume listening, simply click the record player icon again

## Technical Details

- **Frontend**: React-based web interface with continuous listening mode
- **Backend**: Node.js with Fastify framework
- **Audio Processing**: FFmpeg for audio conversion
- **Recognition Services**: 
  - Shazam for primary identification
  - MusicBrainz for metadata lookup
  - Cover Art Archive for album artwork

## Docker Images

Pre-built Docker images are available on Docker Hub:

```bash
# Pull the latest image
docker pull potseeslc/vinylbuddy:latest
```

Or use the included docker-compose.yml file to build and run the application.

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

Uncomment and set the following environment variables in your docker-compose.yml:

```yaml
environment:
  # ... other variables
  - LASTFM_API_KEY=your_api_key_here
  - LASTFM_SECRET=your_shared_secret_here
  - LASTFM_USERNAME=your_lastfm_username
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
5. Add the session key to your docker-compose.yml:
   ```yaml
   environment:
     # ... other variables
     - LASTFM_SESSION_KEY=your_session_key_here
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
