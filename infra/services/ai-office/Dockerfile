# syntax=docker/dockerfile:1.7
# ═══════════════════════════════════════════════════════════════════
# ai-office backend (Fastify + pg)
# Build context = repo root (so we could also bake ai-office-project
# static files later if desired — for now they're bind-mounted in
# docker-compose and served by Caddy directly).
# ═══════════════════════════════════════════════════════════════════
FROM node:22-alpine AS deps
WORKDIR /app
COPY infra/services/ai-office/package.json infra/services/ai-office/package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY infra/services/ai-office/. ./

# Static HTML/JS/CSS — served by Fastify at root (one backend serves all)
COPY ai-office-project ./static

# Non-root user
RUN addgroup -S app && adduser -S app -G app \
 && mkdir -p /data/voice-notes \
 && chown -R app:app /app /data
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
