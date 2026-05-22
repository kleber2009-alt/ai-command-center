# syntax=docker/dockerfile:1.7
# ═══════════════════════════════════════════════════════════════════
# transcribe — Next.js standalone build of ai-command-center
# Build context = repo root. Uses SQLite + sqlite-vec for storage.
# ═══════════════════════════════════════════════════════════════════

# ---- Stage 1: build (full Node image, compiles better-sqlite3 native bindings) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund && \
    test -d node_modules/next || (echo "npm ci finished but node_modules/next is missing" && exit 1)

COPY . .
RUN npm run build
RUN npm prune --omit=dev

# ---- Stage 2: runtime ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DB_PATH=/app/data/app.db

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Native / runtime-loaded modules not bundled by Next
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sqlite-vec ./node_modules/sqlite-vec
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sqlite-vec-linux-x64 ./node_modules/sqlite-vec-linux-x64
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdf-parse ./node_modules/pdf-parse
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/mammoth ./node_modules/mammoth

RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
VOLUME /app/data

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/transcribe').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
