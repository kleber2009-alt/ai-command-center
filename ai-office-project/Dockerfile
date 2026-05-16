# ═══════════════════════════════════════════════════════════════════════
# Dockerfile — ai-office-project
# ───────────────────────────────────────────────────────────────────────
# Single-stage Alpine Node image. Copies the whole project tree (static
# HTML + netlify/functions + server/) and starts the self-hosted server.
# ═══════════════════════════════════════════════════════════════════════

FROM node:20-alpine

# tini gives us PID 1 / clean signal handling.
RUN apk add --no-cache tini

WORKDIR /app

# Copy the whole project. .dockerignore strips the heavy bits (zip, docs,
# .git, IDE files).
COPY . .

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080

EXPOSE 8080

# Smoke-check the server every 30s; container restarts if it stops
# responding.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null 2>&1 || exit 1

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server/index.js"]
