# Multi-stage build for Persona Studio (Next.js 15 standalone)
# Build context must be the repo root so prisma generate can see
# apps/persona-studio/prisma/schema.prisma.
#
# Build:
#   docker build -f apps/persona-studio/Dockerfile \
#     -t persona-studio:latest .
#
# Run:
#   docker run -p 3003:3000 \
#     --env-file apps/persona-studio/.env \
#     persona-studio:latest

# ─── Stage 1: deps ────────────────────────────────────────────────
FROM node:20-slim AS deps
WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY apps/persona-studio/package.json ./apps/persona-studio/package.json
COPY apps/tg-agent/package.json       ./apps/tg-agent/package.json
COPY apps/transcribe/package.json     ./apps/transcribe/package.json

RUN npm ci --workspace=apps/persona-studio --include-workspace-root \
      --no-audit --no-fund

COPY apps/persona-studio/prisma ./apps/persona-studio/prisma
RUN cd apps/persona-studio && npx prisma generate


# ─── Stage 2: build ───────────────────────────────────────────────
FROM deps AS builder
WORKDIR /build

COPY apps/persona-studio ./apps/persona-studio

RUN cd apps/persona-studio && npx next build


# ─── Stage 3: runtime ─────────────────────────────────────────────
FROM node:20-slim AS runtime

RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

WORKDIR /app

# Copy standalone output and static assets
COPY --from=builder --chown=nextjs:nodejs \
  /build/apps/persona-studio/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs \
  /build/apps/persona-studio/.next/static \
  ./apps/persona-studio/.next/static
COPY --from=builder --chown=nextjs:nodejs \
  /build/apps/persona-studio/public \
  ./apps/persona-studio/public

# Prisma client is embedded in standalone; engine binaries still needed
COPY --from=builder --chown=nextjs:nodejs \
  /build/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 3000
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# standalone entry point lives at apps/persona-studio/server.js inside
# the copied tree
CMD ["node", "apps/persona-studio/server.js"]
