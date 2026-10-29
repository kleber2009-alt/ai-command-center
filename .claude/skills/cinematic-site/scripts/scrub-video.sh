#!/usr/bin/env bash
# Encode a video so it can be scrubbed by scroll (video.currentTime = ...).
# The trick from the reference site: short GOP (keyframe every 6 frames), no audio,
# faststart, ~1280px wide. Normal web video has one keyframe per 2-10 s, so seeking
# backwards stutters; with -g 6 every seek decodes at most 5 frames.
#
#   scrub-video.sh input.mp4 output.mp4            # re-encode an existing clip
#   scrub-video.sh --frames 'dir/f%04d.jpg' --fps 32 output.mp4   # from rendered frames
#
# Optional env: WIDTH (default 1280), CRF (default 23), DURATION (trim, seconds).
set -euo pipefail
WIDTH=${WIDTH:-1280}; CRF=${CRF:-23}
if [[ "${1:-}" == "--frames" ]]; then
  pattern=$2; shift 2; fps=32
  if [[ "${1:-}" == "--fps" ]]; then fps=$2; shift 2; fi
  out=$1; in=(-framerate "$fps" -i "$pattern")
else
  src=$1; out=$2; in=(-i "$src")
  [[ -n "${DURATION:-}" ]] && in=(-t "$DURATION" "${in[@]}")
fi
ffmpeg -y -loglevel error "${in[@]}" \
  -vf "scale=${WIDTH}:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -preset slow -crf "$CRF" -profile:v high \
  -g 6 -keyint_min 6 -sc_threshold 0 -bf 0 \
  -an -movflags +faststart "$out"
echo "scrub video -> $out ($(du -h "$out" | cut -f1))"
