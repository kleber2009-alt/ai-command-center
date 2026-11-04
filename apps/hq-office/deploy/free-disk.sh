#!/usr/bin/env bash
# Free disk space on the aicex box before a release of the living office is uploaded (the box hit 100% and the runner
# crashed with «No space left on device»; a full disk also stops the upload itself). Run as root by deploy-hq-office.yml:
#   ssh … bash -s -- [need_gb] < free-disk.sh
# Always: prints the disk and what takes it. Only when less than <need_gb> (default 8) is free, step by step until enough:
#   1. old releases of the office (the current one and two before it stay), caches of the bots' user, apt cache,
#      the journal down to 300 MB, dangling docker images and the build cache (nothing a running container uses);
#   2. job folders of the desk runner (~/hq-runner/jobs) not changed for 6 hours, oldest first — a revision downloads
#      the accepted result back (restore);
# Exit 3 — still not enough: the workflow then runs the routine cleanup of montage jobs (studio-kadrik/deploy/cleanup.sh
# "2 older", the same as its schedule every 2 days).
# Never touches .env files, data folders of the sites and bots, databases, backups or running jobs.
set -uo pipefail
NEED_GB="${1:-8}"
RUSER="${HQ_RUNNER_USER:-iliapaliy}"
RH=$(getent passwd "$RUSER" | cut -d: -f6 || true)
free_gb() { df -P --block-size=1G / | awk 'NR==2 {print $4}'; }
enough() { [ "$(free_gb)" -ge "$NEED_GB" ]; }
report() { echo "disk: $(df -h / | awk 'NR==2 {print $3 " used of " $2 ", " $4 " free (" $5 ")"}')"; }

report
echo "largest:"
du -xsh /opt/* /var/lib/docker /var/log /root /home/* ${RH:+"$RH"/* "$RH"/.[!.]*} 2>/dev/null | sort -h | tail -20 | sed 's/^/  /'
enough && { echo "enough free space (≥ ${NEED_GB} GB) — nothing to delete"; exit 0; }

echo "== 1. old releases, caches, journal, docker leftovers"
for d in /opt/hq-office/releases /opt/hq-office/assistant/releases /opt/hq-office/runner/releases; do
  [ -d "$d" ] && ls -1dt "$d"/* 2>/dev/null | tail -n +4 | xargs -r rm -rf
done
if [ -n "$RH" ]; then
  for c in "$RH/.cache/pip" "$RH/.cache/yt-dlp" "$RH/.npm/_cacache" "$RH/.cache/uv"; do
    [ -e "$c" ] && { echo "rm $(du -sh "$c" | cut -f1) $c"; rm -rf "$c"; }
  done
fi
rm -rf /root/.cache/pip /root/.npm/_cacache 2>/dev/null
apt-get clean 2>/dev/null || true
journalctl --vacuum-size=300M >/dev/null 2>&1 || true
if command -v docker >/dev/null; then
  docker image prune -f 2>/dev/null | tail -1
  docker builder prune -f 2>/dev/null | tail -1
fi
report; enough && exit 0

echo "== 2. job folders of the desk runner, oldest first"
JOBS="$RH/hq-runner/jobs"
if [ -n "$RH" ] && [ -d "$JOBS" ]; then
  echo "runner jobs: $(du -sh "$JOBS" | cut -f1)"
  find "$JOBS" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' | sort -n | cut -d' ' -f2- | while read -r d; do
    enough && break
    [ -n "$(find "$d" -mmin -360 -print -quit)" ] && continue
    echo "rm $(du -sh "$d" | cut -f1) $d"; rm -rf "$d"
  done
fi
report; enough && exit 0

enough || { echo "still less than ${NEED_GB} GB free"; exit 3; }
exit 0
