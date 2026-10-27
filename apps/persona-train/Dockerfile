# syntax=docker/dockerfile:1.6
ARG NODE_VERSION=20-alpine

# ── deps ────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm i; fi

# ── builder ─────────────────────────────────
FROM node:${NODE_VERSION} AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# src/lib/db.ts throws at import without DATABASE_URL, and `next build`
# imports route modules while collecting page data. Build-only stub; the
# real URL comes in at container start.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build npm run build

# ── runner: web ─────────────────────────────
FROM node:${NODE_VERSION} AS web
WORKDIR /app
RUN apk add --no-cache libc6-compat
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3030
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
USER nextjs
EXPOSE 3030
CMD ["node", "server.js"]
