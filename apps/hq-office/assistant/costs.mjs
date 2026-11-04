/* Expenses of the office: every subscription and service the office runs on (ChatPlace, HeyGen, ElevenLabs,
   Anthropic, Claude, the server…) with its price, plus the runs of Claude Code that desk.mjs counts itself.

     DATA_DIR/desk/costs.json   { items:[…], settings:{ usdRub, runs } } — the owner edits it in the office
                                (PUT desk/costs); the first start seeds it from DEFAULTS and HQ_SUBSCRIPTIONS_JSON
                                (the same variable the «Балансы и подписки» skill reads: name, price "$200", renews, url).

   An item: { id, name, amount (number or null — the price is not entered yet), currency USD|RUB|EUR,
   period month|year, since / until YYYY-MM (active months, inclusive; empty — always), renews, url, note }.

   A period's share: a month — the monthly price of every item active that month (a yearly price / 12);
   a day — the monthly price / days of that month; a week — the sum of its 7 days. Nothing is converted
   unless the owner sets the rates (settings.usdRub, settings.eurRub — rubles for a dollar / a euro): then the totals
   are also given as one sum in dollars and rubles. */
import fs from 'node:fs';
import path from 'node:path';

export const CURRENCIES = ['USD', 'RUB', 'EUR'];
// what the office runs on (apps/hq-office, the service-balances skill, docs/ARCHITECTURE.md) — prices are the owner's
export const DEFAULTS = [
  { id:'claude', name:'Claude (подписка)', note:'Max / Pro — на ней работает Claude Code исполнителя, если вход по подписке', url:'https://claude.ai/settings/billing' },
  { id:'anthropic', name:'Anthropic API', note:'диспетчер, ассистент, двойник, CRM Директа', url:'https://console.anthropic.com/settings/billing' },
  { id:'chatplace', name:'ChatPlace', note:'ИИ-менеджер Директа и TG-боты', url:'https://chatplace.io' },
  { id:'heygen', name:'HeyGen', note:'цифровой двойник и голос в рилсах', url:'https://app.heygen.com/settings?nav=Subscriptions%20%26%20API' },
  { id:'elevenlabs', name:'ElevenLabs', note:'голос ассистента, распознавание речи, расшифровки', url:'https://elevenlabs.io/app/subscription' },
  { id:'openai', name:'OpenAI API', url:'https://platform.openai.com/settings/organization/billing' },
  { id:'apify', name:'Apify', note:'сбор Instagram и залётов', url:'https://console.apify.com/billing' },
  { id:'kie', name:'kie.ai', url:'https://kie.ai' },
  { id:'higgsfield', name:'Higgsfield', url:'https://higgsfield.ai' },
  { id:'deepgram', name:'Deepgram', url:'https://console.deepgram.com' },
  { id:'server', name:'Сервер (Hetzner)', note:'aicex.club — офис, исполнитель, сайты', url:'https://console.hetzner.cloud' },
  { id:'domains', name:'Домены', note:'aicex.club и другие' },
];

const round = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;
const month = s => /^\d{4}-\d{2}$/.test(String(s || '')) ? String(s) : '';
const daysIn = ym => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
const slug = s => String(s || '').toLowerCase().replace(/[^a-zа-яё0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'item';

// "$200", "1 500 ₽", "€20/год", 200 → { amount, currency, period }
export function parsePrice(p) {
  if (typeof p === 'number') return { amount:p > 0 ? p : null, currency:'USD' };
  const s = String(p || '').replace(/\s+/g, '');
  const n = Number((s.match(/\d+(?:[.,]\d+)?/) || [''])[0].replace(',', '.'));
  const currency = /₽|руб|rub/i.test(s) ? 'RUB' : /€|eur/i.test(s) ? 'EUR' : 'USD';
  return { amount:n > 0 ? n : null, currency, ...(/год|year|yr|\/y/i.test(s) ? { period:'year' } : {}) };
}

export function cleanItem(x, i = 0) {
  const amount = x.amount === '' || x.amount == null ? null : Number(String(x.amount).replace(',', '.'));
  return {
    id:slug(x.id || x.name) || 'item-' + i,
    name:String(x.name || '').trim().slice(0, 80),
    amount:Number.isFinite(amount) && amount >= 0 ? round(amount, 2) : null,
    currency:CURRENCIES.includes(x.currency) ? x.currency : 'USD',
    period:x.period === 'year' ? 'year' : 'month',
    since:month(x.since), until:month(x.until),
    renews:String(x.renews ?? '').trim().slice(0, 20),
    url:/^https?:\/\//.test(String(x.url || '')) ? String(x.url).slice(0, 300) : '',
    note:String(x.note || '').trim().slice(0, 200),
  };
}

function seed(env) {
  const items = DEFAULTS.map(cleanItem);
  let subs = [];
  try { subs = JSON.parse(env || '[]'); } catch {}
  for (const s of Array.isArray(subs) ? subs : []) {
    if (!s?.name) continue;
    const p = parsePrice(s.price), id = slug(s.name);
    // "Claude Max" fills the Claude row, "HeyGen Creator" the HeyGen one…
    const same = items.find(x => x.id === id || id.startsWith(x.id) || slug(x.name).startsWith(id));
    const row = cleanItem({ ...(same || {}), name:same ? same.name : s.name, ...p, renews:s.renews ?? '', url:s.url || same?.url, note:s.note || same?.note });
    if (same) Object.assign(same, row, { id:same.id }); else items.push(row);
  }
  return items;
}

export function createCosts({ dataDir, subscriptionsJson = process.env.HQ_SUBSCRIPTIONS_JSON || '', usdRub = process.env.HQ_USD_RUB || '', eurRub = process.env.HQ_EUR_RUB || '' }) {
  const FILE = path.join(dataDir, 'costs.json');
  let st = null;
  try { st = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
  if (!st || !Array.isArray(st.items)) st = { items:seed(subscriptionsJson), settings:{} };
  st.settings = cleanSettings({ ...st.settings, usdRub:st.settings?.usdRub ?? usdRub, eurRub:st.settings?.eurRub ?? eurRub });
  const write = () => { try { fs.writeFileSync(FILE + '.tmp', JSON.stringify(st, null, 1)); fs.renameSync(FILE + '.tmp', FILE); } catch {} };

  function cleanSettings(s = {}) {
    const rate = v => { const r = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(r) && r > 0 ? round(r, 2) : null; };
    return { usdRub:rate(s.usdRub), eurRub:rate(s.eurRub), runs:['auto', 'yes', 'no'].includes(s.runs) ? s.runs : 'auto' };
  }
  const active = (x, ym) => (!x.since || x.since <= ym) && (!x.until || ym <= x.until);
  const monthly = x => x.amount == null ? null : x.period === 'year' ? x.amount / 12 : x.amount;

  // share of every item in a period: { kind:'month', month } or { kind:'days', days:['YYYY-MM-DD', …] }
  function period(p) {
    const rows = [];
    for (const x of st.items) {
      const m = monthly(x);
      let share = 0, on = false;
      if (p.kind === 'month') { on = active(x, p.month); share = on && m != null ? m : 0; }
      else for (const d of p.days) { const ym = d.slice(0, 7); if (active(x, ym)) { on = true; if (m != null) share += m / daysIn(ym); } }
      if (on) rows.push({ id:x.id, name:x.name, currency:x.currency, amount:x.amount, period:x.period, share:round(share, 2), missing:x.amount == null });
    }
    return rows;
  }
  // sums by currency and, with the rate, one total in dollars (claude: the Claude Code runs in dollars, when billed)
  function totals(rows, claude = 0) {
    const by = { USD:0, RUB:0, EUR:0 };
    for (const r of rows) by[r.currency] += r.share;
    by.USD += claude;
    const { usdRub, eurRub } = st.settings;
    // one sum only when every currency in it can be converted
    const ok = (!by.RUB || usdRub) && (!by.EUR || (usdRub && eurRub));
    const usd = !ok ? null : by.USD + (by.RUB ? by.RUB / usdRub : 0) + (by.EUR ? by.EUR * eurRub / usdRub : 0);
    return { USD:round(by.USD), RUB:round(by.RUB), EUR:round(by.EUR), usd:usd == null ? null : round(usd), rub:usdRub && usd != null ? Math.round(usd * usdRub) : null,
      missing:rows.filter(r => r.missing).length };
  }

  return {
    get:() => ({ items:st.items.map(x => ({ ...x })), settings:{ ...st.settings }, currencies:CURRENCIES }),
    save(b = {}) {
      if (Array.isArray(b.items)) {
        const seen = new Set();
        st.items = b.items.slice(0, 80).map(cleanItem).filter(x => x.name).map(x => { let id = x.id, n = 2; while (seen.has(id)) id = `${x.id}-${n++}`; seen.add(id); return { ...x, id }; });
      }
      if (b.settings) st.settings = cleanSettings({ ...st.settings, ...b.settings });
      write();
      return this.get();
    },
    period, totals,
    settings:() => ({ ...st.settings }),
  };
}
