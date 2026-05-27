FROM node:20-slim AS build
WORKDIR /app

COPY apps/ig-agent/package.json apps/ig-agent/tsconfig.json ./
RUN npm install --no-audit --no-fund

COPY apps/ig-agent/src ./src
COPY apps/ig-agent/scripts ./scripts
RUN npm run build


FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

# pg_dump for the daily backup scheduler (src/backup.ts). The Debian
# bookworm base ships postgresql-client-15, but our server is 16.13 and
# pg_dump refuses cross-major. Pull postgresql-client-16 from PGDG.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates gnupg wget \
  && install -d /usr/share/postgresql-common/pgdg \
  && wget --quiet -O /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc https://www.postgresql.org/media/keys/ACCC4CF8.asc \
  && echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt bookworm-pgdg main" > /etc/apt/sources.list.d/pgdg.list \
  && apt-get update \
  && apt-get install -y --no-install-recommends postgresql-client-16 \
  && rm -rf /var/lib/apt/lists/*

COPY apps/ig-agent/package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  && rm -rf /root/.npm

COPY --from=build /app/dist ./dist
# Standalone scripts (backfill-memory etc.) — runnable via
# `docker exec ig-agent node /app/scripts/<name>.mjs`.
COPY --from=build /app/scripts ./scripts

EXPOSE 8081

CMD ["node", "dist/index.js"]
