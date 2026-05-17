#!/usr/bin/env bash
# Migration · разворачивание проекта на новом Mac.
#
# Запуск ОДИН РАЗ на новом Mac:
#   cd ~/ai-sales-system
#   bash scripts/migration_import.sh
#
# Что делает:
#   1. Проверяет/ставит Homebrew, Python 3.12, Node.js
#   2. Создаёт code/venv и ставит зависимости
#   3. Ставит netlify-cli глобально
#   4. Помогает заполнить .env
#   5. Проверяет SSH к Hetzner
#   6. Прогоняет тесты

set -uo pipefail  # без -e потому что некоторые проверки могут вернуть non-zero

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()    { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "${RED}✕${NC} $1"; }
step()  { echo -e "\n${BLUE}━━━ $1 ━━━${NC}"; }

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"

echo "════════════════════════════════════════"
echo "AI Sales · migration import"
echo "Project: $PROJECT_DIR"
echo "════════════════════════════════════════"

# ============ 1. Homebrew ============
step "1. Homebrew"

if command -v brew &> /dev/null; then
    ok "Homebrew установлен ($(brew --version | head -1))"
else
    warn "Устанавливаю Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Добавить в PATH для текущей сессии
    if [[ -d /opt/homebrew/bin ]]; then
        eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [[ -d /usr/local/bin/brew ]]; then
        eval "$(/usr/local/bin/brew shellenv)"
    fi
fi

# ============ 2. Python 3.12 ============
step "2. Python 3.12"

if command -v python3.12 &> /dev/null; then
    ok "Python 3.12 установлен ($(python3.12 --version))"
else
    warn "Ставлю Python 3.12 через brew..."
    brew install python@3.12 2>&1 | tail -5
fi

# ============ 3. Node.js + Netlify CLI ============
step "3. Node.js + Netlify CLI"

if command -v node &> /dev/null; then
    ok "Node.js: $(node --version)"
else
    warn "Ставлю Node.js..."
    brew install node 2>&1 | tail -3
fi

if command -v netlify &> /dev/null; then
    ok "Netlify CLI: $(netlify --version 2>/dev/null | head -1)"
else
    warn "Ставлю netlify-cli (потребуется ~2 мин)..."
    npm install -g netlify-cli 2>&1 | tail -3
fi

# ============ 4. Python venv ============
step "4. Python venv для проекта"

cd "$PROJECT_DIR/code"
if [[ -d venv ]]; then
    ok "venv уже существует"
else
    warn "Создаю venv..."
    python3.12 -m venv venv
fi

source venv/bin/activate
ok "Активирован venv: $(which python)"

echo "→ Ставлю зависимости..."
pip install --upgrade pip --quiet
pip install -r requirements.txt --quiet 2>&1 | tail -5

# Дополнительные пакеты которые могут не быть в requirements.txt
pip install eval_type_backport --quiet 2>&1 | tail -2

ok "Зависимости установлены"

# ============ 5. SSH-ключ ============
step "5. SSH-ключ для Hetzner"

if [[ -f ~/.ssh/id_ed25519 ]] || [[ -f ~/.ssh/id_rsa ]]; then
    ok "SSH-ключ есть"
else
    warn "SSH-ключ не найден в ~/.ssh/"
    echo "    Скопируй его из 1Password / защищённой заметки в ~/.ssh/id_ed25519"
    echo "    Затем: chmod 600 ~/.ssh/id_ed25519"
fi

# Тест SSH (без обязательного успеха — может быть offline)
echo "→ Проверяю SSH к Hetzner..."
if timeout 5 ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no -o BatchMode=yes aisales@46.62.215.11 'echo ok' 2>/dev/null | grep -q ok; then
    ok "SSH работает"
else
    warn "SSH не работает (это ОК если ещё не настроил ключ)"
    echo "    Попробуй: ssh aisales@46.62.215.11"
fi

# ============ 6. .env ============
step "6. Локальный .env"

ENV_FILE="$PROJECT_DIR/code/.env"
ENV_EXAMPLE="$PROJECT_DIR/code/.env.example"

if [[ -f "$ENV_FILE" ]]; then
    ok ".env уже существует"
else
    warn ".env не существует — копирую из .env.example"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
fi

echo "→ Текущие плейсхолдеры в .env:"
grep -E '^[A-Z_]+=$' "$ENV_FILE" | head -10 || echo "  (нет пустых — возможно уже заполнено)"

echo ""
echo "  Подставь значения из MIGRATION-SECRETS-*.txt:"
echo "    nano $ENV_FILE"
echo ""
echo "  Минимум для локальной разработки:"
echo "    ANTHROPIC_API_KEY=sk-ant-..."
echo "    AISALES_MOCK=0  (или 1 для тестов без вызовов API)"

# ============ 7. Тесты ============
step "7. Тесты pytest"

echo "→ Прогоняю 46 mock-тестов..."
AISALES_MOCK=1 RESPONSE_DELAY_MIN_S=0 RESPONSE_DELAY_MAX_S=0.01 pytest tests/ --tb=no -q 2>&1 | tail -3

# ============ 8. ~/.claude/skills ============
step "8. Claude Code skills"

CLAUDE_SKILLS_SRC="$PROJECT_DIR/.claude-skills-backup/pro-web-design"
CLAUDE_SKILLS_DST=~/.claude/skills/pro-web-design

# Если в архиве был backup скилла — восстановим
if [[ -d "$CLAUDE_SKILLS_SRC" ]]; then
    mkdir -p ~/.claude/skills
    cp -r "$CLAUDE_SKILLS_SRC" "$CLAUDE_SKILLS_DST"
    ok "Дизайн-скилл pro-web-design восстановлен в $CLAUDE_SKILLS_DST"
elif [[ -d "$CLAUDE_SKILLS_DST" ]]; then
    ok "Дизайн-скилл уже на месте"
else
    warn "Дизайн-скилл pro-web-design не найден"
    echo "    Был на старом Mac: ~/.claude/skills/pro-web-design/"
    echo "    Можно создать заново через skill-creator"
fi

# ============ Summary ============
echo ""
echo "════════════════════════════════════════"
echo "ИМПОРТ ЗАВЕРШЁН"
echo "════════════════════════════════════════"
echo ""
echo "✅ Готово к работе"
echo ""
echo "🎯 Следующие шаги:"
echo ""
echo "  1. Заполни .env ключами:"
echo "     nano $ENV_FILE"
echo ""
echo "  2. Открой проект:"
echo "     cd $PROJECT_DIR"
echo "     python3 -m http.server 8765"
echo "     # → http://localhost:8765/06-dashboard-prototype/pulse.html"
echo ""
echo "  3. Проверь связь с сервером:"
echo "     ssh aisales@46.62.215.11"
echo "     bash ~/health_check.sh"
echo ""
echo "  4. Прочитай где остановились:"
echo "     less $PROJECT_DIR/MIGRATION.md"
echo "     less $PROJECT_DIR/AUTONOMOUS_LOG.md"
echo ""
echo "  5. Если используешь Claude Code:"
echo "     claude  # запусти в директории проекта"
echo ""
