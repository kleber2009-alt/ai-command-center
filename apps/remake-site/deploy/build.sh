#!/usr/bin/env bash
# Build the site release into apps/remake-site/dist/: index.html is the page body (the same file is published as the
# claude.ai artifact, which adds its own document shell), so here it gets a plain document around it.
#   bash apps/remake-site/deploy/build.sh
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
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
echo "✓ $OUT/index.html ($(wc -c < "$OUT/index.html") bytes), seed: $(ls "$APP/seed/runs" | wc -l) run(s), $(ls "$APP/seed/media" | wc -l) media file(s)"
