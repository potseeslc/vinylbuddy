# Dockerfile for Vinyl Buddy (Backend + Static Frontend)

FROM node:20-alpine

# Install ffmpeg and chromaprint (fpcalc)
RUN apk add --no-cache ffmpeg chromaprint

WORKDIR /app

# Copy backend files
COPY api/package*.json ./
RUN npm ci --omit=dev

# Copy all backend code
COPY api/ .

# Copy web frontend as static files (we'll build this locally)
COPY web/ ./web/

# Make fpcalc helper executable
RUN chmod +x ./src/fpcalc-helper.sh

EXPOSE 3000
CMD ["node", "src/server.js"]
