#!/usr/bin/env bash
# End-to-end smoke test for the transcribe deployment.
# Usage: DOMAIN=transcribe.example.com ./smoke.sh
# Optional: TG_INIT_DATA=... to test Telegram-auth path
set -u
DOMAIN="${DOMAIN:-}"
[ -z "$DOMAIN" ] && { echo "set DOMAIN env var"; exit 2; }

pass=0; fail=0
ok()   { echo "  ✓ $1";   pass=$((pass+1)); }
ko()   { echo "  ✗ $1";   fail=$((fail+1)); }

hdr() { echo; echo "== $1 =="; }

req() {
  local name=$1 method=$2 path=$3 want=$4 body=${5:-} extra=${6:-}
  local code
  if [ -n "$body" ]; then
    code=$(curl -sSk --max-time 30 -o /tmp/smoke.out -w "%{http_code}" \
      -X "$method" -H 'Content-Type: application/json' -d "$body" $extra \
      "https://$DOMAIN$path")
  else
    code=$(curl -sSk --max-time 15 -o /tmp/smoke.out -w "%{http_code}" \
      -X "$method" $extra "https://$DOMAIN$path")
  fi
  if [ "$code" = "$want" ]; then ok "$name → HTTP $code"
  else ko "$name → HTTP $code (want $want)"; head -c 200 /tmp/smoke.out; echo; fi
}

hdr "Liveness"
req "/api/health"                GET  /api/health                                200
req "/ redirects"                GET  /                                          307
req "/transcribe page"           GET  /transcribe                                200

hdr "Supabase (GET path)"
req "/api/transcribe/history"    GET  /api/transcribe/history                    200
grep -q '"configured":true' /tmp/smoke.out && ok 'configured=true' || ko 'configured=false (force-dynamic missing or env not set)'

hdr "Deepgram (public MP3)"
req "POST /api/transcribe MP3"   POST /api/transcribe 200 \
  '{"url":"https://download.samplelib.com/mp3/sample-3s.mp3","language":"auto"}'
grep -q '"source":"deepgram"' /tmp/smoke.out && ok 'source=deepgram' || ko 'unexpected source'

hdr "Anthropic (summarize)"
req "POST /api/transcribe/summarize" POST /api/transcribe/summarize 200 \
  '{"transcript":"Тестовый прогон smoke-теста. Проверяем что Claude отвечает."}'
grep -q '"summary":' /tmp/smoke.out && ok 'has summary' || ko 'no summary in response'

hdr "Rate-limit"
echo "  hammering summarize 12×…"
n429=0
for i in $(seq 1 12); do
  c=$(curl -sSk -o /dev/null --max-time 6 -X POST -H 'Content-Type: application/json' \
    -d '{"transcript":""}' -w "%{http_code}" "https://$DOMAIN/api/transcribe/summarize")
  [ "$c" = "429" ] && n429=$((n429+1))
done
if [ $n429 -gt 0 ]; then ok "saw $n429×429 (rate-limit active)"; else ko 'no 429 — limit not enforced'; fi

if [ -n "${TG_INIT_DATA:-}" ]; then
  hdr "Telegram initData verification"
  # Invalid hash must 401 when TELEGRAM_BOT_TOKEN is set
  req "POST with fake initData" POST /api/transcribe/summarize 401 \
    '{"transcript":"x"}' "-H 'X-Telegram-Init-Data: fake=1&hash=deadbeef'"
fi

echo
echo "== Summary =="
echo "pass=$pass fail=$fail"
[ $fail -eq 0 ]
