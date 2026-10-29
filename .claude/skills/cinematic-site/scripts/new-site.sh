#!/usr/bin/env bash
# Scaffold a new cinematic site from the template:  new-site.sh <target_dir>
# Copies assets (site.css, site.js, data.js), the partials/pages example (AI Growth Office)
# and the procedural scene, then builds once. Edit _source/* and assets/data.js, re-run build.py.
set -euo pipefail
T=$(cd "$(dirname "$0")/../template" && pwd); D=$1
[[ -e "$D/index.html" ]] && { echo "$D already has a site"; exit 1; }
mkdir -p "$D/assets" "$D/img" "$D/_source"
cp "$T/assets/"* "$D/assets/"; cp -r "$T/_source/partials" "$T/_source/pages" "$D/_source/"
cp "$T/scene-example.html" "$D/_source/scene.html"
python3 "$(dirname "$0")/build.py" "$D"
echo "scaffolded $D — next: content in assets/data.js + _source/pages, visuals into img/"
