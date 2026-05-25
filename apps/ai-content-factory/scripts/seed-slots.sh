#!/bin/sh
# Generates ONE placeholder MP4 per slot (data/assets/footage/slot-XX-*/).
# Each clip is a coloured vertical card with a caption — enough texture for
# Claude Vision to produce distinct descriptions. Replace with real footage
# by uploading via the cabinet UI.
#
# Usage (inside the running container):
#   docker exec ai-content-factory sh /app/scripts/seed-slots.sh
# Then restart the container so describeBacklogOnStart() picks them up:
#   docker compose -p infra -f docker-compose.yml restart ai-content-factory

set -e
FOOT=/app/data/assets/footage

# args: slot-name, color, caption-text, duration_sec
gen() {
  slot=$1
  color=$2
  text=$3
  dur=$4
  dir="$FOOT/$slot"
  mkdir -p "$dir"
  out="$dir/placeholder.mp4"
  echo "  $slot → $out"
  ffmpeg -y -loglevel error \
    -f lavfi -i "color=c=${color}:s=540x960:d=${dur}" \
    -vf "drawtext=fontfile=/usr/share/fonts/inter/Inter-Bold.ttf:text='${text}':fontcolor=white:fontsize=44:line_spacing=10:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=18" \
    -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p "$out"
}

echo "Seeding 30 placeholder clips into $FOOT/slot-*"

# 10 talking-head
gen slot-01-th-hook-skills        0x4A90E2 "Hook Claude Skills"      6
gen slot-02-th-cca-honest         0x9B59B6 "150 USD Cert honest"     7
gen slot-03-th-morning-coffee     0x27AE60 "Morning coffee Claude"   5
gen slot-04-th-freelancer-mistake 0xE67E22 "Freelancer mistake"      6
gen slot-05-th-1h-to-2min         0x2C3E50 "1 hour to 2 minutes"     7
gen slot-06-th-saved-hour         0x16A085 "Prompt saved 1 hour"     6
gen slot-07-th-no-skills-30pct    0xC0392B "No Skills 30 percent"    6
gen slot-08-th-subscribe-template 0xF39C12 "Subscribe template"      5
gen slot-09-th-wow-reaction       0x8E44AD "Wow Anthropic"           5
gen slot-10-th-tomorrow-n8n       0x34495E "Tomorrow n8n"            6

# 6 screen-cast
gen slot-11-sc-claude-console     0x1E1E2E "Claude Console"          7
gen slot-12-sc-n8n-flow           0xFF6B6B "n8n flow"                6
gen slot-13-sc-notion-ai          0xF5F5F7 "Notion AI summarise"     5
gen slot-14-sc-make-com           0x6C5CE7 "Make scenario"           6
gen slot-15-sc-cursor-claude      0x0D1117 "Cursor inline AI"        7
gen slot-16-sc-workbench          0x3498DB "Workbench compare"       6

# 5 b-roll-typing
gen slot-17-typ-macro-macbook     0xBDC3C7 "Macro MacBook"           5
gen slot-18-typ-standing-desk     0xECF0F1 "Standing desk"           5
gen slot-19-typ-mech-keyboard     0x2C2C2C "RGB mech kb"             5
gen slot-20-typ-ipad-magic        0x95A5A6 "iPad magic kb"           5
gen slot-21-typ-slowmo-enter      0x1ABC9C "Slow-mo enter"           4

# 3 b-roll-coffee
gen slot-22-cof-pouring           0x6F4E37 "Pouring coffee"          5
gen slot-23-cof-mug-notebook      0xD2B48C "Mug notebook"            5
gen slot-24-cof-latte-art         0xC4A484 "Latte art top-down"      5

# 3 b-roll-city
gen slot-25-cty-morning-cars      0xFF8C42 "Morning street"          5
gen slot-26-cty-window-view       0xFFD700 "Window view"             5
gen slot-27-cty-walk-laptop       0x4ECDC4 "Walk with laptop"        5

# 3 b-roll-laptop
gen slot-28-lap-cafe-table        0x8B4513 "Laptop in cafe"          5
gen slot-29-lap-dark-glow         0x0A0E27 "Dark room code glow"     5
gen slot-30-lap-topdown-desk      0xA0522D "Top-down desk"           5

echo "Done. Restart the container so describeBacklog picks them up."
