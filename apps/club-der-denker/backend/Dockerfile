# syntax=docker/dockerfile:1
# Multi-stage Next.js standalone build for the Club Der Denker backend + admin.
# Standalone app (own package-lock.json), so the build context is THIS dir:
#
#   docker build -t cdd-backend apps/club-der-denker/backend
#   # or: docker compose up -d --build   (from this directory)
#
# All env is server-side (no NEXT_PUBLIC_*), so nothing needs to be inlined at
# build time — values are provided at runtime via the compose env_file.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3020
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3020
CMD ["node", "server.js"]
