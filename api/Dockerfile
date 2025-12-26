FROM node:20-alpine

# Install ffmpeg and chromaprint (fpcalc)
RUN apk add --no-cache ffmpeg chromaprint

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm i --omit=dev

COPY . .
RUN chmod +x ./src/fpcalc-helper.sh

EXPOSE 3000
CMD ["node", "src/server.js"]
