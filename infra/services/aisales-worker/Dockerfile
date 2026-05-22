# ═══════════════════════════════════════════════════════════════════
# infra-worker · Dockerfile
# AI Growth Office scheduler/worker — polls scheduled_jobs, runs handlers
# ═══════════════════════════════════════════════════════════════════
FROM node:20-alpine

WORKDIR /app

# Dependencies first (better layer caching)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App code
COPY worker.js ./worker.js
COPY lib ./lib
COPY handlers ./handlers

# Run as non-root
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

ENV NODE_ENV=production

CMD ["node", "worker.js"]
