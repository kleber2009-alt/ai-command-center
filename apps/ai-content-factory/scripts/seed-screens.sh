#!/bin/sh
# Generates ONE placeholder PNG per screen slot
# (data/assets/screens/screen-XX-*/placeholder.png). Coloured 1080×1350 card
# with a caption — replaces with real screenshots/photos via cabinet UI.
#
# Usage (inside the running container):
#   docker exec ai-content-factory sh /app/scripts/seed-screens.sh
# Then restart so describeBacklogOnStart picks them up.

set -e
ROOT=/app/data/assets/screens

# args: slot-name, color, caption-text
gen() {
  slot=$1
  color=$2
  text=$3
  dir="$ROOT/$slot"
  mkdir -p "$dir"
  out="$dir/placeholder.png"
  echo "  $slot → $out"
  ffmpeg -y -loglevel error \
    -f lavfi -i "color=c=${color}:s=1080x1350:d=1" \
    -vf "drawtext=fontfile=/usr/share/fonts/inter/Inter-Bold.ttf:text='${text}':fontcolor=white:fontsize=68:line_spacing=14:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=24" \
    -frames:v 1 "$out"
}

echo "Seeding 30 placeholder PNGs into $ROOT/screen-*"

# 10 covers
gen screen-01-cover-skills        0x4A90E2 "Cover Skills"
gen screen-02-cover-cca           0x9B59B6 "150 USD Cert"
gen screen-03-cover-morning       0x27AE60 "Morning coffee"
gen screen-04-cover-mistake       0xE67E22 "Freelancer mistake"
gen screen-05-cover-before-after  0x2C3E50 "1h to 2 min"
gen screen-06-cover-saved-hour    0x16A085 "Saved 1 hour"
gen screen-07-cover-skills-loss   0xC0392B "No Skills -30 percent"
gen screen-08-cover-template      0xF39C12 "Template"
gen screen-09-cover-news          0x8E44AD "Anthropic news"
gen screen-10-cover-serial        0x34495E "Next n8n"

# 6 UI
gen screen-11-ui-claude-console   0x1E1E2E "Claude Console UI"
gen screen-12-ui-n8n              0xFF6B6B "n8n flow UI"
gen screen-13-ui-notion           0xF5F5F7 "Notion AI"
gen screen-14-ui-make             0x6C5CE7 "Make scenario"
gen screen-15-ui-cursor           0x0D1117 "Cursor inline AI"
gen screen-16-ui-workbench        0x3498DB "Workbench compare"

# 5 backgrounds
gen screen-17-bg-typing           0xBDC3C7 "BG typing"
gen screen-18-bg-standing-desk    0xECF0F1 "BG standing desk"
gen screen-19-bg-mech-kb          0x2C2C2C "BG mech kb"
gen screen-20-bg-ipad             0x95A5A6 "BG iPad"
gen screen-21-bg-enter-key        0x1ABC9C "BG Enter"

# 3 photos coffee
gen screen-22-photo-pouring       0x6F4E37 "Photo pouring"
gen screen-23-photo-mug           0xD2B48C "Photo mug"
gen screen-24-photo-latte         0xC4A484 "Photo latte"

# 3 photos city
gen screen-25-photo-street        0xFF8C42 "Photo street"
gen screen-26-photo-window        0xFFD700 "Photo window"
gen screen-27-photo-walk          0x4ECDC4 "Photo walk"

# 3 photos laptop
gen screen-28-photo-cafe          0x8B4513 "Photo cafe"
gen screen-29-photo-dark-glow     0x0A0E27 "Photo dark glow"
gen screen-30-photo-topdown       0xA0522D "Photo top-down"

echo "Done. Restart the container so describeBacklog picks them up."
