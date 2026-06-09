# ═══════════════════════════════════════════════════════════════════
# infra-worker · Dockerfile
# AI Growth Office scheduler/worker — polls scheduled_jobs, runs handlers
# ───────────────────────────────────────────────────────────────────
# Системные пакеты:
#   python3 + py3-pip + yt-dlp  — для viral_clone (скачивание рилсов)
#   ffmpeg                       — yt-dlp использует для merge a/v
#   ca-certificates              — для https-запросов yt-dlp / fetch
# ═══════════════════════════════════════════════════════════════════
FROM node:20-alpine

WORKDIR /app

# Системные тулзы. yt-dlp ставим из pip — версия свежее, чем в apk.
RUN apk add --no-cache \
      python3 \
      py3-pip \
      ffmpeg \
      ca-certificates \
    && pip3 install --no-cache-dir --break-system-packages yt-dlp

# Node-зависимости (кэшируется отдельным слоем)
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund

# App code
COPY worker.js ./worker.js
COPY lib ./lib
COPY handlers ./handlers

# Рабочая директория для viral_clone (yt-dlp складывает сюда mp4 + .info.json)
RUN mkdir -p /tmp/viral && chown -R 1000:1000 /tmp/viral

# Run as non-root
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app /tmp/viral
USER app

ENV NODE_ENV=production

CMD ["node", "worker.js"]
