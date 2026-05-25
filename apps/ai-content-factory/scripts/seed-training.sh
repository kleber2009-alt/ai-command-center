#!/bin/sh
# Seeds 30 placeholder references (PNG cards) + 30 placeholder prompts (.md
# stubs with the slot description) so the Training tab in the cabinet shows
# something usable on day 1. Replace with real content via the UI.
#
# Usage (inside the running container):
#   docker exec ai-content-factory sh /app/scripts/seed-training.sh
# Then restart so describeBacklogOnStart picks up the references.

set -e
REFS=/app/data/assets/references
PROMPTS=/app/data/assets/prompts
TAGS_REFS=/app/data/assets/references-tags.json
TAGS_PROMPTS=/app/data/assets/prompts-tags.json

mkdir -p "$REFS" "$PROMPTS"

# ── References: PNG cards with the slot label ────────────────────────────
gen_png() {
  slot=$1
  color=$2
  text=$3
  dir="$REFS/$slot"
  mkdir -p "$dir"
  out="$dir/placeholder.png"
  ffmpeg -y -loglevel error \
    -f lavfi -i "color=c=${color}:s=1080x1350:d=1" \
    -vf "drawtext=fontfile=/usr/share/fonts/inter/Inter-Bold.ttf:text='${text}':fontcolor=white:fontsize=58:line_spacing=14:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=24" \
    -frames:v 1 "$out"
  echo "  ref $slot → $out"
}

echo "Seeding 30 reference PNGs into $REFS"
gen_png ref-01-hook-stat          0x2563EB "Hook stat"
gen_png ref-02-hook-question      0x60c8f0 "Hook question"
gen_png ref-03-hook-confession    0xC0392B "Hook confession"
gen_png ref-04-hook-mistake       0xE67E22 "Hook mistake"
gen_png ref-05-hook-secret        0x8E44AD "Hook secret"
gen_png ref-06-stat-bigbang       0x16A085 "Stat bigbang"
gen_png ref-07-stat-comparison    0x27AE60 "Stat compare"
gen_png ref-08-list-numbered      0x34495E "List numbered"
gen_png ref-09-list-checklist     0x9B59B6 "List checklist"
gen_png ref-10-quote-large        0x6F4E37 "Quote large"
gen_png ref-11-code-monospace     0x1E1E2E "Code mono"
gen_png ref-12-screenshot-ui      0x3498DB "UI screenshot"
gen_png ref-13-diagram-flow       0xFF6B6B "Flow diagram"
gen_png ref-14-diagram-venn       0xF39C12 "Venn compare"
gen_png ref-15-tip-tactical       0x84e0a3 "Tip tactical"
gen_png ref-16-tip-before-after   0x2C3E50 "Before after"
gen_png ref-17-warning-pitfall    0xC0392B "Warning"
gen_png ref-18-meta-howto         0x6C5CE7 "Meta howto"
gen_png ref-19-recap-bullets      0x27AE60 "Recap"
gen_png ref-20-cta-keyword        0xF39C12 "CTA keyword"
gen_png ref-21-cta-save           0x16A085 "CTA save"
gen_png ref-22-style-typo-bold    0x0A0E27 "Bold typo"
gen_png ref-23-style-minimalist   0xECF0F1 "Minimalist"
gen_png ref-24-style-editorial    0xD2B48C "Editorial"
gen_png ref-25-style-handwriting  0xA0522D "Handwriting"
gen_png ref-26-color-mono-accent  0x2C2C2C "Mono accent"
gen_png ref-27-color-gradient     0xFF8C42 "Gradient"
gen_png ref-28-layout-asymmetric  0xFFD700 "Asymmetric"
gen_png ref-29-layout-grid        0xBDC3C7 "2x2 grid"
gen_png ref-30-format-meme        0x4ECDC4 "Meme format"

#

echo "Done. Restart so describeBacklog describes the references."
