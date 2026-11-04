// Live numbers of the Meta ad account for the agent «Цифры Meta» (department of Nurken).
// Reads the Graph API with the token of the funnel analytics (META_TOKEN, right ads_read) and the
// account META_AD_ACCOUNT; nothing is written to Meta. Cached for CACHE_MS so the office, the 3D
// screen and the assistant share one request.
//
// Env: META_TOKEN, META_AD_ACCOUNT (act_123… or 123…), META_API_VERSION (default v23.0)

const CACHE_MS = 5 * 60e3;
const LEAD = ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_web_lead', 'onsite_conversion.lead_grouped'];
const PURCHASE = ['purchase', 'offsite_conversion.fb_pixel_purchase', 'omni_purchase'];
const LPV = ['landing_page_view'];
const PERIODS = { today:'today', yesterday:'yesterday', d7:'last_7d', d30:'last_30d' };

const token = () => process.env.META_TOKEN || '';
const account = () => { const a = String(process.env.META_AD_ACCOUNT || '').trim(); return a ? (a.startsWith('act_') ? a : 'act_' + a) : ''; };
export const metaConfigured = () => Boolean(token() && account());

async function get(path, params = {}) {
  const ver = process.env.META_API_VERSION || 'v23.0';
  let url = `https://graph.facebook.com/${ver}/${path}?` + new URLSearchParams({ ...params, access_token:token() });
  const rows = [];
  for (let page = 0; url && page < 10; page++) {
    const r = await fetch(url, { signal:AbortSignal.timeout(30e3) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok || b.error) {
      const e = new Error(b.error?.message || `HTTP ${r.status}`);
      e.status = r.status; e.metaCode = b.error?.code;
      throw e;
    }
    if (!Array.isArray(b.data)) return b;   // a single object (the account itself)
    rows.push(...b.data);
    url = b.paging?.next || '';
  }
  return rows;
}

// several action types describe the same event: take the max, not the sum, to avoid double counting
const act = (list, types) => Math.max(0, ...(list || []).filter(a => types.includes(a.action_type)).map(a => Number(a.value) || 0));
const num = v => Number(v) || 0;
const round = (v, d = 2) => v == null ? null : Math.round(v * 10 ** d) / 10 ** d;

function metrics(r = {}) {
  const spend = num(r.spend), impressions = num(r.impressions), clicks = num(r.inline_link_clicks), reach = num(r.reach);
  const leads = act(r.actions, LEAD), purchases = act(r.actions, PURCHASE), revenue = act(r.action_values, PURCHASE);
  return {
    spend:round(spend), impressions, reach, clicks, leads, purchases, revenue:round(revenue), lpv:act(r.actions, LPV),
    ctr:impressions ? round(clicks / impressions * 100) : null,
    cpc:clicks ? round(spend / clicks) : null,
    cpm:impressions ? round(spend / impressions * 1000) : null,
    cpl:leads ? round(spend / leads) : null,
    roas:spend && revenue ? round(revenue / spend) : null,
    frequency:r.frequency != null ? round(num(r.frequency)) : null,
  };
}

const FIELDS = 'spend,impressions,reach,frequency,inline_link_clicks,actions,action_values';
const STATUS_RU = { ACTIVE:'Активна', PAUSED:'На паузе', CAMPAIGN_PAUSED:'На паузе', ADSET_PAUSED:'На паузе', ARCHIVED:'В архиве',
  DELETED:'Удалена', IN_PROCESS:'Обновляется', WITH_ISSUES:'С ошибками', PENDING_REVIEW:'На проверке', DISAPPROVED:'Отклонена' };
const ACCOUNT_STATUS = { 1:'Активен', 2:'Отключён', 3:'Задолженность', 7:'На проверке', 8:'Ожидает расчёта', 9:'Льготный период', 100:'Ожидает закрытия', 101:'Закрыт' };

async function load() {
  const act_ = account();
  const [info, periods, daily, campInsights, camps] = await Promise.all([
    get(act_, { fields:'name,currency,account_status,amount_spent,spend_cap,balance,timezone_name' }),
    Promise.all(Object.entries(PERIODS).map(async ([k, preset]) => [k, metrics((await get(`${act_}/insights`, { date_preset:preset, fields:FIELDS }))[0])])),
    get(`${act_}/insights`, { date_preset:'last_14d', time_increment:1, fields:'spend,impressions,inline_link_clicks,actions', limit:100 }),
    get(`${act_}/insights`, { date_preset:'last_7d', level:'campaign', fields:'campaign_id,campaign_name,' + FIELDS, limit:200 }),
    get(`${act_}/campaigns`, { fields:'id,name,effective_status,daily_budget,lifetime_budget,objective', limit:200 }),
  ]);
  const byId = Object.fromEntries(campInsights.map(r => [r.campaign_id, r]));
  // currencies like USD / RUB / KZT keep budgets in cents
  const budget = c => c.daily_budget ? { kind:'день', value:num(c.daily_budget) / 100 } : c.lifetime_budget ? { kind:'всего', value:num(c.lifetime_budget) / 100 } : null;
  const campaigns = camps
    .filter(c => byId[c.id] || c.effective_status === 'ACTIVE')
    .map(c => ({ id:c.id, name:c.name, status:c.effective_status, statusRu:STATUS_RU[c.effective_status] || c.effective_status, objective:c.objective || '',
      budget:budget(c), ...metrics(byId[c.id]) }))
    .sort((a, b) => b.spend - a.spend || (b.status === 'ACTIVE') - (a.status === 'ACTIVE'))
    .slice(0, 30);
  return {
    ok:true, updatedAt:new Date().toISOString(),
    account:{ id:act_, name:info.name || act_, currency:info.currency || 'USD', timezone:info.timezone_name || '',
      status:ACCOUNT_STATUS[info.account_status] || String(info.account_status ?? ''), active:info.account_status === 1,
      spent:round(num(info.amount_spent) / 100), cap:info.spend_cap && num(info.spend_cap) ? round(num(info.spend_cap) / 100) : null },
    periods:Object.fromEntries(periods),
    daily:daily.map(r => ({ date:r.date_start, spend:round(num(r.spend)), clicks:num(r.inline_link_clicks), impressions:num(r.impressions), leads:act(r.actions, LEAD) })),
    campaigns,
    active:camps.filter(c => c.effective_status === 'ACTIVE').length,
    link:`https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=${act_.slice(4)}`,
  };
}

let cache = null, pending = null;
function errorView(e) {
  const auth = e.status === 401 || e.metaCode === 190 || e.metaCode === 200 || e.metaCode === 10;
  return { ok:false, updatedAt:new Date().toISOString(), error:auth
    ? 'Meta не пускает в кабинет: токен истёк или у него нет права ads_read на этот кабинет.'
    : e.metaCode === 17 || e.metaCode === 613 ? 'Meta просит подождать (лимит запросов) — цифры обновятся через несколько минут.'
    : 'Не удалось получить цифры из Meta: ' + String(e.message || e).slice(0, 200) };
}

// fresh=true skips the cache (the «Обновить» button), but never more often than once a minute
export async function metaLive(fresh = false) {
  if (!metaConfigured()) return { ok:false, configured:false, error:'Кабинет Meta не подключён: нужен токен META_TOKEN (секрет FUNNEL_META_TOKEN) и ID кабинета META_AD_ACCOUNT (переменная HQ_META_AD_ACCOUNT).' };
  const age = cache ? Date.now() - Date.parse(cache.updatedAt) : Infinity;
  if (cache && age < (fresh ? 60e3 : CACHE_MS)) return cache;
  pending ||= load().then(v => (cache = v)).catch(e => { console.error('meta:', e.message); const v = errorView(e); if (!cache?.ok) cache = v; return cache.ok ? { ...cache, stale:true, error:v.error } : v; })
    .finally(() => { pending = null; });
  return pending;
}

// one line for the assistant and the twin: only from the cache (never waits for Meta), refreshes it in the background
export function metaNote() {
  if (!metaConfigured()) return '';
  const age = cache ? Date.now() - Date.parse(cache.updatedAt) : Infinity;
  if (age > CACHE_MS) metaLive().catch(() => {});
  if (!cache?.ok || age > 3 * 3600e3) return '';
  const c = cache.account.currency, f = v => v == null ? '—' : `${v} ${c}`, p = cache.periods;
  const line = (name, m) => `${name}: расход ${f(m.spend)}, лиды ${m.leads}, цена лида ${f(m.cpl)}, CTR ${m.ctr ?? '—'}%`;
  const top = cache.campaigns.filter(x => x.spend).slice(0, 5).map(x => `«${x.name}» (${x.statusRu}): ${f(x.spend)}, лиды ${x.leads}, CPL ${f(x.cpl)}`).join('; ');
  return `\nРеклама Meta (реальные цифры кабинета «${cache.account.name}», обновлено ${new Date(cache.updatedAt).toLocaleTimeString('ru-RU', { timeZone:'Europe/Moscow', hour:'2-digit', minute:'2-digit' })} МСК): `
    + [line('сегодня', p.today), line('вчера', p.yesterday), line('7 дней', p.d7), line('30 дней', p.d30)].join('; ')
    + `. Активных кампаний ${cache.active}.${top ? ' Кампании за 7 дней: ' + top + '.' : ''}`;
}
