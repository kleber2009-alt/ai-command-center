/* «Ключи» в админ-панели владельца: что из ключей и доступов офиса уже заполнено — галочкой, без значений.

   Откуда известно: выкладка (deploy-hq-office.yml, шаг «Keys of the morning agents») дописывает в assistant.env только ИМЕНА
   заполненных секретов GitHub (HQ_KEYS_SET), имена систем исполнителя из HQ_RUNNER_MCP_JSON (HQ_KEYS_MCP) и время (HQ_KEYS_AT).
   Плюс то, что видно на сервере вживую: ключи в окружении ассистента, ключи владельца из «Кабинета» (integrations.mjs),
   исполнитель на связи и вход Claude Code у него (desk runner). Значения ключей сюда не попадают никогда. */

const env = k => String(process.env[k] || '').trim();
const list = k => env(k).split(',').map(s => s.trim()).filter(Boolean);

/* each row: the secrets that fill it (first set wins), or a cabinet integration id, or a check of its own.
   need: 'main' — без него офис не работает как задумано; 'opt' — по желанию */
export const KEYS = [
  { group:'Офис', id:'password', name:'Пароль владельца', uses:'вход в офис, кабинет, админка', secrets:['HQ_ASSISTANT_PASSWORD'], live:['HQ_ASSISTANT_PASSWORD'], need:'main' },
  { group:'Офис', id:'anthropic', name:'Claude (Anthropic API)', uses:'ассистент, двойник, диспетчер, контролёр', secrets:['HQ_OFFICE_ANTHROPIC_API_KEY'], live:['ANTHROPIC_API_KEY'], cabinet:'anthropic', need:'main' },
  { group:'Офис', id:'runner', name:'Исполнитель и вход Claude Code', uses:'все задачи агентов', check:'runner', need:'main' },
  { group:'Офис', id:'tgbot', name:'Бот офиса в Telegram', uses:'пульт, карточки задач, мини-апп', secrets:['HQ_TG_BOT_TOKEN', 'HQ_NOTIFY_TG_BOT_TOKEN'], live:['HQ_TG_BOT_TOKEN'], need:'main' },
  { group:'Офис', id:'tgchat', name:'Ваш Telegram (id чата)', uses:'утренние отчёты, предупреждения', secrets:['HQ_NOTIFY_TG_CHAT_ID'], live:['HQ_NOTIFY_TG_CHAT'], need:'main' },
  { group:'Офис', id:'voice', name:'Голос двойника (ID голоса)', uses:'ответы голосом-клоном', secrets:['HQ_ASSISTANT_VOICE_ID'], live:['ELEVENLABS_VOICE_ID'], need:'opt' },
  { group:'Нейросети', id:'openai', name:'OpenAI', uses:'расшифровка, картинки', secrets:['REMAKE_OPENAI_API_KEY', 'TRANSCRIBE_OPENAI_API_KEY'], cabinet:'openai', need:'main' },
  { group:'Нейросети', id:'elevenlabs', name:'ElevenLabs', uses:'голос, распознавание речи, расшифровка', secrets:['PERSONA_TRAIN_ELEVENLABS_API_KEY', 'REMAKE_ELEVENLABS_API_KEY', 'WORKER_ELEVENLABS_API_KEY'], live:['ELEVENLABS_API_KEY'], cabinet:'elevenlabs', need:'main' },
  { group:'Нейросети', id:'heygen', name:'HeyGen', uses:'аватар, Ремейк залёта, Рилс под ключ', secrets:['REMAKE_HEYGEN_API_KEY', 'PERSONA_TRAIN_HEYGEN_API_KEY', 'WORKER_HEYGEN_API_KEY'], cabinet:'heygen', need:'main' },
  { group:'Нейросети', id:'deepgram', name:'Deepgram', uses:'быстрая расшифровка', secrets:['TRANSCRIBE_DEEPGRAM_API_KEY'], cabinet:'deepgram', need:'opt' },
  { group:'Нейросети', id:'kie', name:'kie.ai', uses:'картинки и видео (Veo, Kling, Flux)', secrets:['AI_HUB_KIE_API_KEY'], cabinet:'kie', need:'opt' },
  { group:'Данные и соцсети', id:'apify', name:'Apify', uses:'залёты конкурентов, статистика Instagram', secrets:['REMAKE_APIFY_TOKEN', 'WORKER_APIFY_API_TOKEN', 'TRANSCRIBE_APIFY_API_TOKEN'], cabinet:'apify', need:'main' },
  { group:'Данные и соцсети', id:'instagram', name:'Instagram', uses:'публикации, аналитика', secrets:['HQ_IG_ACCESS_TOKEN', 'REMAKE_IG_ACCESS_TOKEN'], live:['HQ_IG_ACCESS_TOKEN'], cabinet:'instagram', need:'main' },
  { group:'Данные и соцсети', id:'threads', name:'Threads', uses:'публикации, аналитика', secrets:['HQ_THREADS_ACCESS_TOKEN'], live:['HQ_THREADS_ACCESS_TOKEN'], cabinet:'threads', need:'main' },
  { group:'Данные и соцсети', id:'youtube', name:'YouTube', uses:'статистика канала', secrets:['HQ_YOUTUBE_API_KEY'], cabinet:'youtube', need:'opt' },
  { group:'Данные и соцсети', id:'tgchannel', name:'Telegram-канал', uses:'статистика канала', secrets:['SOCIAL_TG_CHANNEL'], cabinet:'telegram', need:'opt' },
  { group:'Данные и соцсети', id:'meta', name:'Meta Ads', uses:'реклама, балансы', secrets:['FUNNEL_META_TOKEN'], cabinet:'meta', need:'opt' },
  { group:'Данные и соцсети', id:'subs', name:'Подписки без API', uses:'даты продления в «Балансах»', secrets:['SUBS'], need:'opt' },
  { group:'Системы агентов', id:'chatplace', name:'ChatPlace (MCP)', uses:'цепочки, Директ, кодовые слова', mcp:/chat.?place/i, cabinet:'chatplace', need:'main' },
  { group:'Системы агентов', id:'windsor', name:'Windsor (Meta Ads по MCP)', uses:'данные рекламы для агентов', mcp:/windsor/i, need:'opt' },
  { group:'Системы агентов', id:'heygenmcp', name:'HeyGen (MCP)', uses:'аватар прямо из задачи агента', mcp:/heygen/i, need:'opt' },
  { group:'Связи', id:'remake', name:'Связь с @instaoo_bot', uses:'план дня, ✅ контент-плана', secrets:['REMAKE_SITE_TOKEN'], live:['HQ_REMAKE_TOKEN'], need:'main' },
  { group:'Связи', id:'cabinet', name:'Вебхук кабинета Нейроворонки', uses:'события ChatPlace и оплат в кабинет', secrets:['HQ_CABINET_TOKEN'], live:['HQ_CABINET_TOKEN'], need:'opt' },
];

export function keysStatus({ cabinet = [], runner = null } = {}) {
  const set = new Set(list('HQ_KEYS_SET')), mcp = list('HQ_KEYS_MCP'), cab = Object.fromEntries(cabinet.map(c => [c.id, c]));
  const known = set.size > 0 || Boolean(env('HQ_KEYS_AT'));
  const rows = KEYS.map(k => {
    let ok = false, from = '', warn = '';
    if (k.check === 'runner') {
      const c = runner?.claude;
      ok = Boolean(runner?.online && (!c || c.ok));
      from = runner?.online ? (c ? (c.ok ? `Claude Code: ${c.auth || 'вход есть'}` : 'Claude Code не вошёл') : 'на связи') : 'не на связи';
      if (runner?.online && c && !c.ok) warn = c.error || 'нет входа Claude Code';
    } else {
      const s = (k.secrets || []).find(n => set.has(n)), l = (k.live || []).find(n => env(n)), m = k.mcp && mcp.find(n => k.mcp.test(n)), c = k.cabinet && cab[k.cabinet];
      if (c?.connected) { ok = c.check?.ok !== false; from = 'кабинет' + (c.check?.account ? ` · ${c.check.account}` : ''); if (c.check && !c.check.ok) warn = c.check.error || 'проверка не прошла'; }
      if (!ok && s) { ok = true; from = `секрет ${s}`; }
      if (!ok && l) { ok = true; from = 'на сервере'; }
      if (!ok && m) { ok = true; from = `система «${m}»`; }
    }
    return { id:k.id, group:k.group, name:k.name, uses:k.uses, need:k.need, ok, from, warn };
  });
  const main = rows.filter(r => r.need === 'main');
  return { at:env('HQ_KEYS_AT'), known, rows, total:rows.length, filled:rows.filter(r => r.ok).length,
    mainTotal:main.length, mainFilled:main.filter(r => r.ok).length, mcp };
}
