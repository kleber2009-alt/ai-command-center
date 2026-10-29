# API сайта «Ремейк залёта» и студия (remake.aicex.club/api/*): node + ffmpeg (кадры, звук) + python3 (гейт и кодовое
# слово — скрипты скилла remake-top-reel в skill/) + yt-dlp (референс по ссылке). Собирается на сервере из релиза:
# deploy/build.sh кладёт сюда server.mjs, studio.mjs, reels-bot.mjs, carousel-bot.mjs, package*.json, skill/ и carousel-skill/, deploy/server.sh делает docker build.
FROM node:22-alpine
# chromium + шрифты — слайды ветки «Instagram Карусели» (Jost и Tinos — из npm @fontsource)
RUN apk add --no-cache ffmpeg python3 ca-certificates curl chromium font-dejavu
# yt-dlp ломается вслед за Instagram и TikTok — берём свежий релиз; аргумент меняется раз в неделю и сбрасывает кэш слоя
ARG YTDLP_REFRESH=0
RUN echo "yt-dlp refresh $YTDLP_REFRESH" \
 && curl -fsSL --retry 3 -o /usr/local/bin/yt-dlp https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp && yt-dlp --version
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force
COPY server.mjs studio.mjs reels-bot.mjs carousel-bot.mjs tg-branch.mjs ./
COPY skill ./skill
COPY carousel-skill ./carousel-skill
ENV NODE_ENV=production PORT=8790 DATA_DIR=/data SKILL_DIR=/app/skill CAROUSEL_SKILL_DIR=/app/carousel-skill CHROMIUM_BIN=/usr/bin/chromium-browser
USER node
EXPOSE 8790
CMD ["node", "server.mjs"]
