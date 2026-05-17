# syntax=docker/dockerfile:1.7

# ---- Stage 1: deps & build (full Node image, compiles better-sqlite3 native bindings) ----
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Build deps for better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV NEXT_TELEMETRY_DISABLED=1

COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund && \
    test -d node_modules/next || (echo "npm ci finished but node_modules/next is missing" && exit 1)

COPY . .
RUN npm run build

# Trim down node_modules to production deps only.
RUN npm prune --omit=dev

# ---- Stage 2: runtime ----
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DB_PATH=/app/data/app.db

# Non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Next.js standalone output
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# better-sqlite3, sqlite-vec, pdf-parse (pdfjs-dist), mammoth are loaded at runtime via require()
# and not bundled into the Next.js server. Copy them from the pruned production deps.
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sqlite-vec ./node_modules/sqlite-vec
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/sqlite-vec-linux-x64 ./node_modules/sqlite-vec-linux-x64
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdf-parse ./node_modules/pdf-parse
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pdfjs-dist ./node_modules/pdfjs-dist
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/mammoth ./node_modules/mammoth

# Persistent SQLite directory
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
VOLUME /app/data

USER nextjs
EXPOSE 3000

CMD ["node", "server.js"]
