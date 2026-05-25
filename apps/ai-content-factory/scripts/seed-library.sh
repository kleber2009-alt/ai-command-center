#!/bin/sh
# Generates 30 placeholder MP4 clips into data/assets/footage/library/.
# Each clip is a coloured vertical card with a caption — enough texture for
# Claude Vision to produce distinct descriptions, so the reels pipeline can
# pick clips by content. Designed to be replaced with real footage later.
#
# Usage (inside the running container):
#   docker exec ai-content-factory sh /app/scripts/seed-library.sh
# Then restart the container so describeBacklogOnStart() picks them up:
#   docker compose -p infra -f docker-compose.yml restart ai-content-factory

set -e
LIB=/app/data/assets/footage/library
mkdir -p "$LIB"

# args: idx, color, text, duration_sec
gen() {
  idx=$1
  color=$2
  text=$3
  dur=$4
  slug=$(echo "$text" | tr ' ' '_' | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_]//g' | cut -c1-40)
  out="$LIB/$(printf 'seed-%02d-%s.mp4' "$idx" "$slug")"
  echo "  $idx → $out"
  ffmpeg -y -loglevel error \
    -f lavfi -i "color=c=${color}:s=540x960:d=${dur}" \
    -vf "drawtext=fontfile=/usr/share/fonts/inter/Inter-Bold.ttf:text='${text}':fontcolor=white:fontsize=44:line_spacing=10:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=18" \
    -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p "$out"
}

echo "Seeding 30 placeholder clips into $LIB"

# 10 talking-head-ish
gen 01 0x4A90E2 "Claude Skills demo"             6
gen 02 0x9B59B6 "150 USD Claude Cert"            7
gen 03 0x27AE60 "Morning coffee + Claude"        5
gen 04 0xE67E22 "Common fluant mistake"          6
gen 05 0x2C3E50 "From 1 hour to 2 minutes"       7
gen 06 0x16A085 "Prompt that saved 1 hour"       6
gen 07 0xC0392B "No Skills = lose 30 percent"    6
gen 08 0xF39C12 "Subscribe for templates"        5
gen 09 0x8E44AD "Wow Anthropic just released"    5
gen 10 0x34495E "Tomorrow n8n + Claude"          6

# 6 screen-cast-ish
gen 11 0x1E1E2E "Claude Console request"         7
gen 12 0xFF6B6B "n8n flow demo"                  6
gen 13 0xFFFFFF "Notion AI summarise"            5
gen 14 0x6C5CE7 "Make scenario run"              6
gen 15 0x0D1117 "Cursor inline AI"               7
gen 16 0x3498DB "Workbench compare"              6

# 5 b-roll-typing
gen 17 0xBDC3C7 "Hands on MacBook"               5
gen 18 0xECF0F1 "Standing desk typing"           5
gen 19 0x2C2C2C "RGB mechanical keyboard"        5
gen 20 0x95A5A6 "iPad magic keyboard"            5
gen 21 0x1ABC9C "Slow-mo enter key"              4

# 3 b-roll-coffee
gen 22 0x6F4E37 "Pouring coffee"                 5
gen 23 0xD2B48C "Cup mug notebook"               5
gen 24 0xC4A484 "Latte art top-down"             5

# 3 b-roll-city
gen 25 0xFF8C42 "Morning street cars"            5
gen 26 0xFFD700 "Window high view"               5
gen 27 0x4ECDC4 "Walk with laptop"               5

# 3 b-roll-laptop
gen 28 0x8B4513 "Laptop in cafe"                 5
gen 29 0x0A0E27 "Dark room code glow"            5
gen 30 0xA0522D "Top-down desk setup"            5

echo "Done. Restart the container so describeBacklog picks them up."
ls -la "$LIB" | wc -l
