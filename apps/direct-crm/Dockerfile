# CRM Директа (apps/direct-crm): node 22 + встроенный node:sqlite, одна зависимость — SDK Claude.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs ./
COPY lib ./lib
COPY public ./public
ENV NODE_ENV=production PORT=8795 DATA_DIR=/data
USER node
EXPOSE 8795
CMD ["node", "--disable-warning=ExperimentalWarning", "server.mjs"]
