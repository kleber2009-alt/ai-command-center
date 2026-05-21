# syntax=docker/dockerfile:1.7
# Multi-stage build:
#   - deps:    install node_modules from lockfile
#   - builder: next build (produces .next/standalone)
#   - web:     slim runtime for Next.js (port 3010)
#   - worker:  fuller runtime with tsx for BullMQ worker (no port)
#
# Build both targets from one image:
#   docker build --target web    -t ai-hub-web    .
#   docker build --target worker -t ai-hub-worker .

# ============ deps ============
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ============ builder ============
FROM node:20-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Stub envs so Next.js build doesn't fail on missing runtime envs.
# Real values come in at container start time.
ENV DATABASE_URL=postgres://stub:stub@stub:5432/stub
ENV NEXT_PUBLIC_SUPABASE_URL=stub
ENV AUTH_SECRET=stub
RUN npm run build

# ============ web runtime ============
FROM node:20-alpine AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN addgroup -g 1001 -S nodejs && adduser -u 1001 -S nextjs -G nodejs
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3010
ENV PORT=3010 HOSTNAME=0.0.0.0
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3010/api/health > /dev/null || exit 1
CMD ["node", "server.js"]

# ============ worker runtime ============
FROM node:20-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache libc6-compat
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src           ./src
COPY --from=builder /app/drizzle       ./drizzle
COPY --from=builder /app/scripts       ./scripts
COPY --from=builder /app/package.json  ./package.json
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/next.config.mjs ./next.config.mjs
CMD ["npx", "tsx", "src/lib/jobs/runner.ts"]
