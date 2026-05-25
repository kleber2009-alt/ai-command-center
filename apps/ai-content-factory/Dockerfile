# ai-content-factory — Node 20 + Chromium (Puppeteer) + better-sqlite3 + sqlite-vec
#
# Multi-stage:
#   1. deps   — install with native modules
#   2. build  — tsc → dist/
#   3. runner — slim runtime with system chromium

FROM --platform=linux/amd64 node:20-bookworm-slim AS deps
WORKDIR /app

# Build deps for better-sqlite3 + sqlite-vec native modules
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Skip Puppeteer's own Chromium — we install Debian's at runtime
ENV PUPPETEER_SKIP_DOWNLOAD=1
COPY package.json package-lock.json* ./
# DO NOT use --omit=optional: sqlite-vec ships its native binary as an
# optional, platform-specific package (sqlite-vec-linux-x64 here).
RUN npm ci

FROM deps AS build
COPY tsconfig.json eslint.config.js ./
COPY src ./src
RUN npm run build

FROM --platform=linux/amd64 node:20-bookworm-slim AS runner
WORKDIR /app

# Chromium for Puppeteer + fonts (Inter + JetBrains Mono for the carousel /
# reels templates) + ffmpeg for reels video.
#
# Inter ships only in Debian Trixie+; Bookworm gets it via a pinned GitHub
# release. We install once at build time so generation never depends on a
# live network.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ffmpeg \
      fonts-jetbrains-mono \
      fonts-liberation \
      fonts-dejavu-core \
      fonts-noto-color-emoji \
      ca-certificates \
      tini \
      curl \
      unzip \
      fontconfig \
    && mkdir -p /usr/share/fonts/inter /tmp/inter \
    && curl -fsSL https://github.com/rsms/inter/releases/download/v4.0/Inter-4.0.zip -o /tmp/inter.zip \
    && unzip -q /tmp/inter.zip -d /tmp/inter \
    && find /tmp/inter -type f -name 'Inter-*.ttf' -exec cp {} /usr/share/fonts/inter/ \; \
    && find /tmp/inter -type f -name 'InterVariable*.ttf' -exec cp {} /usr/share/fonts/inter/ \; \
    && rm -rf /tmp/inter /tmp/inter.zip \
    && fc-cache -f \
    && apt-get remove --purge -y curl unzip \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=1 \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production \
    TZ=Europe/Moscow

COPY --from=deps   /app/node_modules ./node_modules
COPY --from=build  /app/dist          ./dist
COPY package.json ./
COPY data ./data
COPY config ./config
COPY public ./public

# Persisted between runs: outputs, logs, knowledge db
RUN mkdir -p /app/data/output /app/data/logs /app/data/knowledge

EXPOSE 3018
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "dist/index.js"]
