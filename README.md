# Vinyl Buddy

Vinyl Buddy is a self-hosted web application that helps you identify vinyl records by listening to a snippet of the music and matching it against music databases. Simply point your phone's microphone at your turntable, record a short clip, and let Vinyl Buddy identify the album and track for you.

## Features

- **Audio Recognition**: Records audio snippets and identifies tracks using multiple music recognition services
- **Shazam Integration**: Uses Shazam for accurate music recognition
- **AcoustID/MusicBrainz Integration**: Alternative recognition method using fingerprinting technology
- **Metadata Search**: Search by artist, album, or track name when audio recognition isn't sufficient
- **Cover Art Display**: Shows album artwork when available
- **Self-Hosted**: Run the application on your own hardware for complete privacy
- **Docker Support**: Easy deployment using Docker containers

## Prerequisites

- Docker and Docker Compose installed on your system
- Microphone access (built-in or external)

## Quick Start with Docker Compose

1. Create a `docker-compose.yml` file:

```yaml
version: '3.8'

services:
  vinylbuddy:
    image: potseeslc/vinylbuddy:latest
    ports:
      - "3000:3000"
    volumes:
      - ./uploads:/app/uploads
```

2. Start the service:
```bash
docker-compose up -d
```

3. Access the application in your browser at http://localhost:3000

## Example Deployment

See the `examples/docker-compose.yml` file for an example using named volumes:

```yaml
version: '3.8'

services:
  vinylbuddy:
    image: potseeslc/vinylbuddy:latest
    ports:
      - "3000:3000"
    volumes:
      - vinyl-uploads:/app/uploads
    environment:
      - NODE_ENV=production

volumes:
  vinyl-uploads:
```

## Configuration

The application requires no additional configuration to run, but you can customize:

- **Port**: Change the port mapping in docker-compose.yml
- **Upload Directory**: Modify the volume mapping to change where audio files are stored

## Usage

1. Open the Vinyl Buddy web interface in your browser
2. Click the "Record" button and hold your phone's microphone near your turntable
3. Play a section of the record (15-30 seconds works best)
4. Stop recording and wait for the identification results
5. View the identified album information and cover art

## Recognition Methods

Vinyl Buddy uses multiple recognition methods:

1. **Shazam Recognition**: Primary method using the Shazam API
2. **AcoustID Fingerprinting**: Alternative method using audio fingerprinting
3. **Metadata Search**: Manual search by artist/album/track information

## Technical Details

- **Frontend**: React-based web interface
- **Backend**: Node.js with Fastify framework
- **Audio Processing**: FFmpeg for audio conversion
- **Recognition Services**: 
  - Shazam for primary identification
  - AcoustID for fingerprint-based recognition
  - MusicBrainz for metadata lookup
  - Cover Art Archive for album artwork

## Docker Images

Pre-built Docker images are available on Docker Hub:

```bash
# Pull the latest image
docker pull potseeslc/vinylbuddy:latest

# Run with default settings
docker run -p 3000:3000 -v ./uploads:/app/uploads potseeslc/vinylbuddy:latest
```

## Building from Source

If you prefer to build from source:

1. Clone the repository
2. Navigate to the project directory
3. Build the Docker image:
```bash
docker build -t potseeslc/vinylbuddy:latest .
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues, feature requests, or questions, please open an issue on the GitHub repository.
