# ═══════════════════════════════════════════════════════════════════════
# Dockerfile — Next.js transcribe app (self-hosted)
# ───────────────────────────────────────────────────────────────────────
# Multi-stage: deps → build → runtime. Использует next.js standalone
# output чтобы финальный образ остался лёгким.
# ═══════════════════════════════════════════════════════════════════════

# ── 1. deps ──────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ── 2. build ─────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js считывает NEXT_PUBLIC_* в момент сборки. Прокидываем безопасные
# пустые значения, чтобы build не падал; реальные секреты остаются на
# runtime через env_file.
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ── 3. runtime ───────────────────────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app

RUN apk add --no-cache tini wget

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# standalone содержит минимальный node_modules + server.js
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
