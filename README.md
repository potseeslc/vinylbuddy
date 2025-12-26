# Vinyl Buddy

A self-hosted web application that identifies vinyl records using your device's microphone and displays album information including cover art and tracklist.

## Features

- Records audio samples from your device's microphone
- Identifies full albums using AcoustID and MusicBrainz
- Displays album cover art from Cover Art Archive
- Shows complete tracklist with track numbers and durations
- Self-hosted with Docker for easy deployment
- Protected by Cloudflare Access for secure internet access

## Prerequisites

- Docker and Docker Compose
- A Cloudflare account (for secure internet access)
- An AcoustID API key (free)
- A MusicBrainz contact URL or email

## Setup

1. Clone this repository:
   ```bash
   git clone <repository-url>
   cd vinyl-now-playing
   ```

2. Build and start the services:
   ```bash
   docker-compose up --build
   ```

3. Access the application at `http://localhost:8081`

4. Configure API keys through the web interface:
   - Click the "API Keys" button
   - Enter your AcoustID API key and MusicBrainz contact information
   - Click "Save Configuration"

### Alternative: Environment Variables
You can also configure the API keys using environment variables:

1. Copy the example environment file:
   ```bash
   cp api/.env.example api/.env
   ```

2. Edit `api/.env` and add your API keys:
   ```
   ACOUSTID_API_KEY=your_acoustid_api_key_here
   MUSICBRAINZ_CONTACT=https://yourwebsite.com
   ```

3. Rebuild and restart the services:
   ```bash
   docker-compose up --build
   ```

## Cloudflare Tunnel Setup (for internet access)

To access your application securely over the internet:

1. Install Cloudflare Tunnel (cloudflared) on your server
2. Create a tunnel:
   ```bash
   cloudflared tunnel create vinyl-now-playing
   ```

3. Route the tunnel to your local service:
   ```bash
   cloudflared tunnel route dns vinyl-now-playing vinyl.yourdomain.com
   ```

4. Run the tunnel:
   ```bash
   cloudflared tunnel run vinyl-now-playing
   ```

5. Configure Cloudflare Access in the Zero Trust dashboard to protect your application

## How It Works

1. The web interface requests microphone access and records audio samples
2. Audio is sent to the backend API for processing
3. The API converts audio to WAV format using ffmpeg
4. Chromaprint's fpcalc generates an audio fingerprint
5. The fingerprint is sent to AcoustID for matching
6. Matching releases are retrieved from MusicBrainz
7. Album artwork is fetched from Cover Art Archive
8. All information is displayed in the web interface

### Architecture Details

The application uses a reverse proxy (Caddy) to route requests:
- `/api/*` requests are forwarded to the Node.js API service (with the `/api` prefix stripped)
- All other requests are served by the React frontend

This means API endpoints are defined without the `/api` prefix in the Node.js code, as Caddy handles the routing.

## API Keys

### AcoustID
1. Go to https://acoustid.org/api-key
2. Register for an API key (free for non-commercial use)
3. Add it to your environment variables

### MusicBrainz
1. No API key required, but you must provide contact information
2. Add a URL or email to your environment variables

## Usage

1. Navigate to the web interface
2. Set your desired sample length (recommended 30 seconds for best results)
3. Click "Start Listening" and allow microphone access
4. Place your device near the record player
5. View the identified album information

## Troubleshooting

- If identification fails, try increasing the sample length
- Ensure your record player is playing music when recording
- Check that your microphone is working and positioned correctly
- Verify your API keys are correctly configured

## Development

### Backend (Node.js)
- Located in the `api/` directory
- Uses Fastify for the web server
- Handles audio processing, fingerprinting, and API calls

### Frontend (React)
- Located in the `web/` directory
- Uses Vite for development and building
- Provides the user interface for recording and displaying results

### Adding New Features
1. Modify the appropriate service (api or web)
2. Rebuild the Docker containers:
   ```bash
   docker-compose up --build
   ```

## License

This project is open source and available under the MIT License.
