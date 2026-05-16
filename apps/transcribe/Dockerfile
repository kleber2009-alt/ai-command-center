# syntax=docker/dockerfile:1.6
# Multi-stage build for the transcribe Next.js app.
# Build context MUST be the repo root (we need root package.json + workspace).

FROM node:20-alpine AS deps
WORKDIR /repo
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY apps/transcribe/package.json apps/transcribe/package.json
RUN npm ci --no-audit --no-fund

FROM node:20-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY apps/transcribe ./apps/transcribe
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Standalone output bundles node_modules + server.js at repo root.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/transcribe/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/transcribe/.next/static ./apps/transcribe/.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "apps/transcribe/server.js"]
