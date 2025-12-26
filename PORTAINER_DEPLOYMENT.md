# Vinyl Buddy Deployment with Portainer

## Docker Compose File

The `docker-compose.yml` file in this directory can be used to deploy Vinyl Buddy with Portainer.

## Deployment Instructions

1. **In Portainer:**
   - Go to your Portainer dashboard
   - Select your environment/endpoint
   - Click on "Stacks" in the left navigation
   - Click "Add stack"
   - Choose one of these options:
     - **Option 1:** Upload the docker-compose.yml file
     - **Option 2:** Copy and paste the content into the web editor
     - **Option 3:** Use Git repository (point to your repo containing the compose file)

2. **Configure Environment Variables:**
   - Before deploying, make sure to set the following environment variables:
     - `MUSICBRAINZ_CONTACT`: Your email address for MusicBrainz API (required)
     - `ACOUSTID_API_KEY`: Your AcoustID API key (optional but recommended for fingerprinting)

3. **Deploy:**
   - Give your stack a name (e.g., "vinylbuddy")
   - Click "Deploy the stack"

4. **Access the Application:**
   - Once deployed, access Vinyl Buddy at http://your-server-ip:3000

## Volume Persistence

The compose file creates a Docker volume for uploaded audio files:
- Volume name: `vinylbuddy_uploads`
- This ensures your uploaded files persist across container restarts

## Health Checks

The service includes a health check that verifies the API is responding correctly.

## Environment Variables

- `MUSICBRAINZ_CONTACT`: Required - Your email address for MusicBrainz API usage
- `ACOUSTID_API_KEY`: Optional - Your AcoustID API key for audio fingerprinting

## Updating the Application

To update to the latest version:
1. In Portainer, go to your stack
2. Click "Update the stack"
3. Select "Pull latest image" option
4. Click "Update"

## Notes

- The application uses port 3000 by default
- All audio processing (ffmpeg, fpcalc) is handled within the container
- Make sure your server has sufficient resources for audio processing
