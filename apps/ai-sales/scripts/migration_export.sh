#!/usr/bin/env bash
# Migration · упаковка проекта для переезда на новый Mac.
#
# Запуск на старом Mac (один раз):
#   cd ~/ai-sales-system
#   bash scripts/migration_export.sh
#
# Создаёт в ~/Downloads/:
#   - ai-sales-MIGRATION-YYYYMMDD.zip       · весь код, чистый
#   - ai-sales-MIGRATION-SECRETS-YYYYMMDD.txt · что подставить руками
#   - ai-sales-MIGRATION-ssh-config-YYYYMMDD.txt · known_hosts для Hetzner

set -euo pipefail

DATE=$(date +%Y%m%d)
PROJECT=~/ai-sales-system
DOWNLOADS=~/Downloads

if [[ ! -d "$PROJECT" ]]; then
    echo "✕ Проект не найден: $PROJECT"
    exit 1
fi

cd "$PROJECT"

echo "════════════════════════════════════════"
echo "AI Sales · migration export · $DATE"
echo "════════════════════════════════════════"
echo ""

# ============ Snapshot текущего состояния ============
echo "→ Текущее состояние:"
echo "  Project size: $(du -sh "$PROJECT" 2>/dev/null | cut -f1)"
echo "  Files:        $(find "$PROJECT" -type f -not -path '*/venv/*' -not -path '*/.git/*' -not -path '*/__pycache__/*' -not -path '*/.DS_Store' 2>/dev/null | wc -l)"
echo "  Python tests: $(find "$PROJECT/code/tests" -name 'test_*.py' 2>/dev/null | wc -l) файлов"
echo ""

# ============ Главный архив ============
MAIN_ZIP="$DOWNLOADS/ai-sales-MIGRATION-${DATE}.zip"
echo "→ Архивирую в $MAIN_ZIP..."

rm -f "$MAIN_ZIP"
cd "$(dirname "$PROJECT")"  # ~/

zip -rq "$MAIN_ZIP" "$(basename "$PROJECT")" \
    -x "*/venv/*" \
    -x "*/__pycache__/*" \
    -x "*/.pytest_cache/*" \
    -x "*/.ruff_cache/*" \
    -x "*/.DS_Store" \
    -x "*/code/.env" \
    -x "*/code/.env.local" \
    -x "*/voice-input/audio/*" \
    -x "*/voice-input/transcripts/*" \
    -x "*/voice-input/analysis/*" \
    -x "*/carousels/generated/*" \
    -x "*/reels/generated/*" \
    -x "*/content-bank/generated-captions/*" \
    -x "*/content-bank/pipeline-log.jsonl" \
    -x "*.pyc" \
    -x "*/.git/*" \
    -x "*/.netlify/*"

cd "$PROJECT"

# ============ Secrets checklist ============
SECRETS_TXT="$DOWNLOADS/ai-sales-MIGRATION-SECRETS-${DATE}.txt"
cat > "$SECRETS_TXT" << 'EOF'
═══════════════════════════════════════════════════════════════
   AI SALES · СЕКРЕТЫ ДЛЯ ПЕРЕНОСА (вручную)
═══════════════════════════════════════════════════════════════

Этот файл НЕ копировать на новый Mac в проект.
Используй как чек-лист — что нужно вспомнить / достать.

───────────────────────────────────────────────────────────────
1. ANTHROPIC_API_KEY
───────────────────────────────────────────────────────────────
  Где взять:  console.anthropic.com → Settings → API Keys
  Куда:       ~/ai-sales-system/code/.env (для локалки)
              + уже на сервере в ~/aisales-app-v2/code/.env

  Текущий формат: sk-ant-api03-...

───────────────────────────────────────────────────────────────
2. TG_BOT_TOKEN · @ilia_pali0_bot
───────────────────────────────────────────────────────────────
  Где взять:  у @BotFather → /token → выбрать ilia_pali0_bot
              ИЛИ из ~/aisales-app-v2/code/.env на сервере
              ИЛИ из чата на старом Mac (Cmd+F "8854052425")

  Текущий бот: @ilia_pali0_bot (chat_id владельца: 1280515130)

───────────────────────────────────────────────────────────────
3. TG_WEBHOOK_SECRET
───────────────────────────────────────────────────────────────
  Где взять:  ~/aisales-app-v2/code/.env на сервере
              grep TG_WEBHOOK_SECRET ~/aisales-app-v2/code/.env

───────────────────────────────────────────────────────────────
4. SSH к Hetzner
───────────────────────────────────────────────────────────────
  IP сервера: 46.62.215.11
  Пользователь: aisales
  SSH-ключ: ~/.ssh/id_ed25519 (или id_rsa — проверь какой у тебя)

  Перенести через 1Password / защищённую заметку:
    cat ~/.ssh/id_ed25519     ← скопируй вывод
    cat ~/.ssh/id_ed25519.pub ← публичный ключ

  Пароль учётки aisales (на крайний случай):
    был сохранён в твоих Notes ("Hetzner aisales password")

───────────────────────────────────────────────────────────────
5. Postgres / Redis / MinIO пароли
───────────────────────────────────────────────────────────────
  Хранятся в ~/aisales-app-v2/code/.env на сервере.
  Не нужны на новом Mac, потому что они только для production.

───────────────────────────────────────────────────────────────
6. Netlify (если будешь обратно деплоить дашборд)
───────────────────────────────────────────────────────────────
  Аккаунт:    ilia.info.paliy@gmail.com
  Сайт:       soft-longma-b5d4f0.netlify.app
  На новом Mac: netlify login (через браузер)

───────────────────────────────────────────────────────────────
7. Notion knowledge base
───────────────────────────────────────────────────────────────
  Workspace: AI Mastery Platform → AI Sales System
  Главная база знаний: notion.so/3604924397e18173ad41fb2904d24590

  5 коллекций (databases):
    🎭 Голос и тон    · 32c5a2285cf34f2d9558ddfc953058c6
    🛒 Продукты       · be0939e113f54707a47d1ae4ce4a064b
    🎯 Сегменты       · 9f3497a8dce948c7a093adfa719dec5a
    🛡️ Возражения     · c10ffd767e02456caccc2b4ca47c33af
    📚 Контент-память · 01946f92a8bd4d649cf38634e72a8ffe

───────────────────────────────────────────────────────────────
8. ElevenLabs (когда будешь настраивать голос)
───────────────────────────────────────────────────────────────
  elevenlabs.io → Profile → API Keys
  Voice ID — после создания Instant Voice Clone

───────────────────────────────────────────────────────────────
9. OpenAI (опционально, для Whisper API fallback)
───────────────────────────────────────────────────────────────
  platform.openai.com → API Keys
  Нужно только если faster-whisper локально не справится

═══════════════════════════════════════════════════════════════
                ↓ ИНСТРУКЦИЯ НА НОВОМ MAC ↓
═══════════════════════════════════════════════════════════════

1. unzip ~/Downloads/ai-sales-MIGRATION-*.zip -d ~
2. Восстанови ~/.ssh/id_ed25519 (из 1Password)
3. cd ~/ai-sales-system && bash scripts/migration_import.sh
4. Заполни code/.env значениями выше
5. Проверь связь с сервером: ssh aisales@46.62.215.11
EOF

# ============ SSH known_hosts ============
SSH_CONFIG="$DOWNLOADS/ai-sales-MIGRATION-ssh-config-${DATE}.txt"
cat > "$SSH_CONFIG" << 'EOF'
# Скопируй ЭТУ строку в ~/.ssh/known_hosts на новом Mac,
# чтобы не подтверждать fingerprint при первом SSH:

EOF

if [[ -f ~/.ssh/known_hosts ]]; then
    grep "46.62.215.11" ~/.ssh/known_hosts >> "$SSH_CONFIG" 2>/dev/null || \
        echo "# 46.62.215.11 не найден в known_hosts (не страшно, подтвердишь fingerprint при первом ssh)" >> "$SSH_CONFIG"
fi

cat >> "$SSH_CONFIG" << 'EOF'

# Для удобства добавь в ~/.ssh/config:

Host aisales
    HostName 46.62.215.11
    User aisales
    IdentityFile ~/.ssh/id_ed25519
    ServerAliveInterval 60

# После этого можно: ssh aisales (без указания юзера и IP)
EOF

# ============ Summary ============
MAIN_SIZE=$(du -h "$MAIN_ZIP" | cut -f1)

echo ""
echo "════════════════════════════════════════"
echo "✓ ГОТОВО"
echo "════════════════════════════════════════"
echo ""
echo "Перенеси на новый Mac (AirDrop / iCloud / флешка):"
echo ""
echo "  📦  $MAIN_ZIP ($MAIN_SIZE)"
echo "  🔑  $SECRETS_TXT"
echo "  🔐  $SSH_CONFIG"
echo ""
echo "А SSH-ключ копируй ОТДЕЛЬНО (через 1Password):"
echo "  cat ~/.ssh/id_ed25519"
echo "  (или id_rsa — какой у тебя есть)"
echo ""
echo "На новом Mac:"
echo "  unzip $MAIN_ZIP -d ~"
echo "  cd ~/ai-sales-system"
echo "  bash scripts/migration_import.sh"
echo ""
