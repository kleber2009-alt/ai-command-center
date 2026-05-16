# ═══════════════════════════════════════════════════════════════════════
# Dockerfile — ai-office-project (self-hosted)
# ───────────────────────────────────────────────────────────────────────
# Single-stage Alpine Node. Ставит pg (нужен voice-* функциям) и
# запускает Node-сервер, который раздаёт статику + проксирует /api/*
# в netlify/functions/*.
# ═══════════════════════════════════════════════════════════════════════

FROM node:20-alpine

RUN apk add --no-cache tini wget

WORKDIR /app

# Сначала ставим зависимости сервера. server/package.json меняется реже
# остального — лучше кэшируется.
COPY server/package.json server/package-lock.json* server/
RUN cd server && npm install --omit=dev --no-audit --no-fund

# Копируем остальной проект (HTML, netlify/functions, и т.д.).
COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV VOICE_NOTES_DIR=/data/voice-notes

EXPOSE 8080

# Каталог под mp3 от voice-generate (монтируется как volume в compose).
RUN mkdir -p /data/voice-notes

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
