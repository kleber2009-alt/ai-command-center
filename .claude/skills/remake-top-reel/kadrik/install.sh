#!/usr/bin/env bash
# Установка «Ремейка залёта»
#   bash install.sh                            скилл → ~/.claude/skills/remake-top-reel + строка в каталоге «Студии Кадрика»
#   bash install.sh --styles <aicex-library>   заодно три стиля монтажа и их зависимости из библиотеки AICEX
#                                              (только те, которых ещё нет: настроенные на этой машине не трогаем)
#   PACK_DIR=~/creator-pack-miniapp            где мини-апп Creator Pack (как в боте; по умолчанию этот путь)
# Каталог: строка из catalog-entry.py вписывается в CATALOG в build.py (бэкап build.py.bak.<время>),
# затем build.py пересобирает public/skills.json — бот увидит скилл без перезапуска.
set -euo pipefail

SRC="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$HOME/.claude/skills/remake-top-reel"
PACK="${PACK_DIR:-$HOME/creator-pack-miniapp}"
LIB=""
if [ "${1:-}" = "--styles" ]; then
  LIB="${2:?укажи путь к библиотеке aicex-library}"
fi

mkdir -p "$HOME/.claude/skills"
if [ "$SRC" != "$DEST" ]; then
  rm -rf "$DEST.new"
  cp -R "$SRC" "$DEST.new"
  find "$DEST.new" -name __pycache__ -type d -prune -exec rm -rf {} +
  rm -rf "$DEST"
  mv "$DEST.new" "$DEST"
  echo "OK скилл → $DEST"
fi

if [ -n "$LIB" ]; then
  for s in glass-explainer-reel explainer-panel-reel business-short-form-reels edit-review creator-setup \
           hyperframes hyperframes-cli hyperframes-animation hyperframes-core; do
    if [ -d "$HOME/.claude/skills/$s" ]; then
      echo "-- $s уже стоит, не трогаю"
    elif [ -d "$LIB/skills/claude-code/$s" ]; then
      cp -R "$LIB/skills/claude-code/$s" "$HOME/.claude/skills/$s"
      echo "OK стиль/зависимость → $s"
    else
      echo "WARN нет $s в $LIB/skills/claude-code"
    fi
  done
fi

if [ ! -f "$PACK/build.py" ]; then
  echo "-- мини-апп Creator Pack не найден ($PACK/build.py) — каталог «Студии Кадрика» пропускаю"
  exit 0
fi

python3 -I - "$PACK/build.py" "$DEST/kadrik/catalog-entry.py" <<'PY'
import datetime, shutil, sys
build, entry_file = sys.argv[1], sys.argv[2]
src = open(build).read()
if 'id="remake-top-reel"' in src:
    print("-- «Ремейк залёта» уже в каталоге")
    sys.exit(0)
entry = open(entry_file).read().strip()
anchor = "# --- рилсы 9:16 ---"
if anchor not in src:
    sys.exit(f"не нашёл «{anchor}» в {build} — впиши строку из {entry_file} в CATALOG руками")
shutil.copy2(build, f"{build}.bak.{datetime.datetime.now():%Y%m%d_%H%M%S}")
src = src.replace(anchor, anchor + "\n" + "\n".join("  " + l for l in entry.splitlines()), 1)
pick = "PICK = {"
if pick in src:
    src = src.replace(pick, pick + '\n  "remake-top-reel": ["advice", "numbers", "explain"],', 1)
open(build, "w").write(src)
print("OK «Ремейк залёта» вписан в CATALOG", build)
PY

(cd "$PACK" && python3 -I build.py)
