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

COPY apps/ig-agent/package.json ./
RUN npm install --omit=dev --no-audit --no-fund \
  && rm -rf /root/.npm

COPY --from=build /app/dist ./dist
# Standalone scripts (backfill-memory etc.) — runnable via
# `docker exec ig-agent node /app/scripts/<name>.mjs`.
COPY --from=build /app/scripts ./scripts

EXPOSE 8081

CMD ["node", "dist/index.js"]
