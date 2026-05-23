# syntax=docker/dockerfile:1
# Multi-stage Next.js standalone build for the transcribe app.
# Build context MUST be the repo root (npm workspaces need package-lock.json
# and the sibling workspace package.json files for `npm ci`).
#
# Build from repo root:
#   docker build -f apps/transcribe/Dockerfile -t transcribe .

FROM node:20-alpine AS deps
WORKDIR /repo
COPY package.json package-lock.json ./
COPY apps/transcribe/package.json apps/transcribe/package.json
COPY apps/tg-agent/package.json apps/tg-agent/package.json
RUN npm ci --workspace=apps/transcribe --include-workspace-root --ignore-scripts \
 && mkdir -p apps/transcribe/node_modules

FROM node:20-alpine AS builder
WORKDIR /repo
COPY --from=deps /repo/node_modules ./node_modules
# workspace-local node_modules only exist when npm can't hoist; copy the dir
# (possibly empty) so the build can still resolve everything from root node_modules
COPY --from=deps /repo/apps/transcribe/node_modules ./apps/transcribe/node_modules
COPY package.json package-lock.json ./
COPY apps/transcribe/ apps/transcribe/
# NODE_ENV=production is critical — without it Next.js bundles the
# development React runtime and SSG of /404, /500 crashes with
# "<Html> should not be imported outside of pages/_document".
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=apps/transcribe

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Next.js standalone output for a workspace mirrors the monorepo layout
# under .next/standalone, so server.js lives at apps/transcribe/server.js.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/transcribe/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/transcribe/.next/static ./apps/transcribe/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/transcribe/public ./apps/transcribe/public
# Standalone scripts (backfill-memory etc.) — runnable via `docker exec
# infra-transcribe-1 node /app/apps/transcribe/scripts/<name>.mjs`.
# Next.js standalone build puts source under apps/transcribe/, so the
# scripts dir lives at the same depth.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/transcribe/scripts ./apps/transcribe/scripts

USER nextjs
EXPOSE 3000
CMD ["node", "apps/transcribe/server.js"]
