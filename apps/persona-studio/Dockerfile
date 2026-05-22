# syntax=docker/dockerfile:1.6
ARG NODE_VERSION=20-alpine

# ── deps ────────────────────────────────────
FROM node:${NODE_VERSION} AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY package.json package-lock.json* pnpm-lock.yaml* yarn.lock* ./
COPY prisma ./prisma
RUN \
  if [ -f pnpm-lock.yaml ]; then corepack enable && corepack prepare pnpm@latest --activate && pnpm i --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci --legacy-peer-deps; \
  elif [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  else npm i; fi

# ── builder ─────────────────────────────────
FROM node:${NODE_VERSION} AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate
# Build-time env stubs — Next.js "Collecting page data" импортирует server-модули,
# которые через env.ts (Zod fail-fast) требуют ENV. Реальные значения приходят
# в runtime через env_file: .env (см. docker-compose.yml).
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    S3_ENDPOINT=http://build.local \
    S3_ACCESS_KEY=build S3_SECRET_KEY=build \
    KIE_API_KEY=build HEYGEN_API_KEY=build ELEVENLABS_API_KEY=build
RUN npm run build

# ── runner: web ─────────────────────────────
FROM node:${NODE_VERSION} AS web
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3020
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma
USER nextjs
EXPOSE 3020
CMD ["node", "server.js"]

# ── runner: worker ──────────────────────────
FROM node:${NODE_VERSION} AS worker
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json ./package.json
CMD ["npx", "tsx", "src/workers/index.ts"]
