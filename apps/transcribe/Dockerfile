# Multi-stage build for the Next.js transcribe app.
# Uses Next.js' "standalone" output so the runtime image only ships the
# bits needed to `node server.js` — no source, no dev deps.

FROM node:20-slim AS deps
WORKDIR /app

COPY apps/transcribe/package.json ./apps/transcribe/package.json
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund --workspace=@app/transcribe --include-workspace-root


FROM node:20-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/transcribe/node_modules ./apps/transcribe/node_modules
COPY package.json package-lock.json* ./
COPY apps/transcribe ./apps/transcribe

RUN npm run build --workspace=@app/transcribe


FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Standalone output bundles a minimal node_modules + server.js.
# Static assets and the public/ folder must be copied separately.
COPY --from=build /app/apps/transcribe/.next/standalone ./
COPY --from=build /app/apps/transcribe/.next/static ./apps/transcribe/.next/static

EXPOSE 3000

CMD ["node", "apps/transcribe/server.js"]
