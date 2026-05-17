# Multi-stage build for the Telegram AI agent service.
# Build stage compiles better-sqlite3's native bindings; runtime image
# stays slim and ships only the production node_modules + dist.

FROM node:20-slim AS build
WORKDIR /app

# Native deps for better-sqlite3 compilation.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY apps/tg-agent/package.json apps/tg-agent/tsconfig.json ./
RUN npm install --no-audit --no-fund

COPY apps/tg-agent/src ./src
COPY apps/tg-agent/scripts ./scripts
RUN npm run build


FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Runtime still needs build-essential during `npm install --omit=dev`
# because better-sqlite3's install step rebuilds the binding against
# the runtime node version. Once installed we drop the build deps to
# keep the image small.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

COPY apps/tg-agent/package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  && apt-get purge -y python3 make g++ \
  && apt-get autoremove -y \
  && rm -rf /var/lib/apt/lists/* /root/.npm

COPY --from=build /app/dist ./dist

# SQLite file lives here. Bind a docker volume to keep it.
RUN mkdir -p /app/data
VOLUME ["/app/data"]
ENV DATABASE_PATH=/app/data/tg-agent.db

EXPOSE 8080

CMD ["node", "dist/index.js"]
