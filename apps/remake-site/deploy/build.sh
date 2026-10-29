#!/usr/bin/env bash
# Build the site release into apps/remake-site/dist/: index.html is the page body (the same file is published as the
# claude.ai artifact, which adds its own document shell), so here it gets a plain document around it. Next to it — the API
# image context (Dockerfile, server.mjs, studio.mjs, reels-bot.mjs, package*.json) and skill/: the remake-top-reel files the studio runs
# (config.json, scripts/*.py for the script gate and the code word, references/script-rules.md for Claude).
#   bash apps/remake-site/deploy/build.sh
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
SKILL="$APP/../../.claude/skills/remake-top-reel"
OUT="$APP/dist"
rm -rf "$OUT" && mkdir -p "$OUT"
{
  printf '<!doctype html>\n<html lang="ru">\n<head>\n<meta charset="utf-8">\n'
  printf '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
  printf '<meta name="description" content="Ремейк залёта: как залетевший рилс @ilia.paliy превращается в новый — отбор, расшифровка, сценарий, аватар и монтаж по шагам.">\n'
  printf '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%%}[hidden]{display:none!important}</style>\n'
  printf '</head>\n<body>\n'
  cat "$APP/index.html"
  printf '\n</body>\n</html>\n'
} > "$OUT/index.html"
cp -R "$APP/seed" "$OUT/seed"
cp "$APP/server.mjs" "$APP/studio.mjs" "$APP/reels-bot.mjs" "$APP/carousel-bot.mjs" "$APP/tg-branch.mjs" "$APP/package.json" "$APP/package-lock.json" "$APP/Dockerfile" "$APP/.dockerignore" "$OUT/"
mkdir -p "$OUT/skill/scripts" "$OUT/skill/references"
cp "$SKILL/config.json" "$OUT/skill/"
cp "$SKILL"/scripts/*.py "$OUT/skill/scripts/"
cp "$SKILL/references/script-rules.md" "$OUT/skill/references/"
# «Instagram Карусели»: settings and the rules Claude follows (the carousel-pro skill)
mkdir -p "$OUT/carousel-skill/references"
cp "$APP/../../.claude/skills/carousel-pro/config.json" "$OUT/carousel-skill/"
cp "$APP/../../.claude/skills/carousel-pro/references/carousel-rules.md" "$OUT/carousel-skill/references/"
echo "✓ $OUT/index.html ($(wc -c < "$OUT/index.html") bytes), seed: $(ls "$APP/seed/runs" | wc -l) run(s), $(ls "$APP/seed/media" | wc -l) media file(s), api + studio, skill: $(ls "$OUT/skill/scripts" | wc -l) script(s)"
