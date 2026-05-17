# Multi-stage build for the Telegram AI agent service.
FROM node:20-slim AS build
WORKDIR /app

COPY apps/tg-agent/package.json apps/tg-agent/tsconfig.json ./
RUN npm install --no-audit --no-fund

COPY apps/tg-agent/src ./src
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY apps/tg-agent/package.json ./
RUN npm install --omit=dev --no-audit --no-fund

COPY --from=build /app/dist ./dist

CMD ["node", "dist/index.js"]
