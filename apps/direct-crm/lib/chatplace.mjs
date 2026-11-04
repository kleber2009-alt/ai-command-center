/* ChatPlace through its MCP server (streamable HTTP, JSON-RPC) — the same connection the office runner uses
   (secret HQ_RUNNER_MCP_JSON → mcpServers.chatplace: { url, headers }).
   Only the tools the CRM needs: chats_list, chats_get, chats_messages (read) and chats_open, chats_send_message,
   chats_close (Bogdan takes a chat from the AI, answers, gives it back). */

const VERSION = '1';

// ChatPlace sits behind Cloudflare, which bans a client that asks too fast (HTTP 429, error 1015): one request per gapMs
export function createChatPlace({ url, headers = {}, fetchImpl = fetch, gapMs = 1500 }) {
  if (!url) throw new Error('ChatPlace: no MCP url');
  let sid = '', rid = 0, ready = null, last = 0;
  const sent = [];   // times of the requests in the last minute — /api/health shows the rate

  async function rpc(method, params, { notify = false } = {}) {
    const body = { jsonrpc:'2.0', method, params:params || {} };
    if (!notify) body.id = ++rid;
    const h = { 'content-type':'application/json', accept:'application/json, text/event-stream',
      // ChatPlace answers 403 to some default client names — introduce ourselves
      'user-agent':`direct-crm/${VERSION}`, ...headers };
    if (sid) h['mcp-session-id'] = sid;
    const r = await fetchImpl(url, { method:'POST', headers:h, body:JSON.stringify(body), signal:AbortSignal.timeout(30000) });
    sid = r.headers.get('mcp-session-id') || sid;
    const raw = await r.text();
    if (r.status === 404 && sid && method !== 'initialize') { sid = ''; ready = null; throw Object.assign(new Error('session expired'), { retry:true }); }
    if (r.status === 429 || /error 1015|rate.?limit/i.test(raw.slice(0, 400)) && !r.ok) {
      throw Object.assign(new Error(`ChatPlace ${method}: HTTP ${r.status} — rate limited`), { rateLimited:true, status:429 });
    }
    if (!r.ok) throw new Error(`ChatPlace ${method}: HTTP ${r.status} ${raw.slice(0, 160)}`);
    if (notify) return null;
    let msgs = [];
    if ((r.headers.get('content-type') || '').includes('text/event-stream')) {
      for (const line of raw.split('\n')) if (line.startsWith('data:')) { try { msgs.push(JSON.parse(line.slice(5).trim())); } catch {} }
    } else if (raw.trim()) {
      const j = JSON.parse(raw); msgs = Array.isArray(j) ? j : [j];
    }
    const m = msgs.find(x => x && x.id === body.id);
    if (!m) throw new Error(`ChatPlace: no answer to ${method}`);
    if (m.error) throw new Error(`ChatPlace ${method}: ${m.error.message || JSON.stringify(m.error)}`.slice(0, 240));
    return m.result || {};
  }

  async function init() {
    await rpc('initialize', { protocolVersion:'2025-06-18', capabilities:{}, clientInfo:{ name:'direct-crm', version:VERSION } });
    try { await rpc('notifications/initialized', {}, { notify:true }); } catch {}
  }

  async function call(name, args = {}) {
    for (let attempt = 0; attempt < 2; attempt++) {
      ready ||= init().catch(e => { ready = null; throw e; });
      await ready;
      const wait = last + gapMs - Date.now();
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      last = Date.now();
      sent.push(last); while (sent.length && sent[0] < last - 60_000) sent.shift();
      try {
        const res = await rpc('tools/call', { name, arguments:args });
        if (res.isError) throw new Error(`ChatPlace ${name}: ${textOf(res).slice(0, 240)}`);
        return dataOf(res);
      } catch (e) {
        if (e.retry && attempt === 0) continue;
        throw e;
      }
    }
  }

  return {
    listChats: (opts = {}) => call('chats_list', opts),
    getChat: chatId => call('chats_get', { chatId }),
    messages: (chatId, page = 1, limit = 50) => call('chats_messages', { chatId, page, limit }),
    open: chatId => call('chats_open', { chatId }),
    close: chatId => call('chats_close', { chatId }),
    send: (chatId, text) => call('chats_send_message', { chatId, text }),
    // automations: their code words, steps, buttons and per-step / per-button counts
    bots: () => call('bots_list'),
    automations: botId => call('automations_list', { botId }),
    automation: automationId => call('automations_get_detail', { automationId }),
    // the AI agent's knowledge base: questions it could not answer, and answering them
    kbQuestions: botId => call('ai_agent_knowledge_base_questions', { botId }),
    kbAnswer: (datasetId, answer) => call('ai_agent_knowledge_base_add_answer', { datasetId, answer }),
    rate: () => { const t = Date.now(); while (sent.length && sent[0] < t - 60_000) sent.shift(); return sent.length; },
    gapMs,
  };
}

const textOf = res => (res.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');

// a tool answers with structuredContent, or with JSON as text
function dataOf(res) {
  if (res.structuredContent != null) {
    const s = res.structuredContent;
    return s && typeof s === 'object' && 'result' in s && Object.keys(s).length === 1 ? s.result : s;
  }
  const t = textOf(res).trim();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return t; }
}

/* mcp-config of the office runner → { url, headers } of the chatplace server (headers may hold ${VAR}) */
export function chatPlaceFromMcpJson(raw, env = process.env) {
  if (!raw) return null;
  let cfg;
  try { cfg = JSON.parse(raw); } catch { return null; }
  const servers = cfg.mcpServers || {};
  const key = Object.keys(servers).find(k => /chat.?place/i.test(k)) || Object.keys(servers).find(k => /chatplace/i.test(servers[k]?.url || ''));
  const s = key && servers[key];
  if (!s?.url) return null;
  const expand = v => String(v).replace(/\$\{(\w+)\}|\$(\w+)/g, (_, a, b) => env[a || b] ?? '');
  return { url:expand(s.url), headers:Object.fromEntries(Object.entries(s.headers || {}).map(([k, v]) => [k, expand(v)])) };
}
