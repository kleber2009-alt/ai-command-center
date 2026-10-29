/* AI Growth Office — site content. Leads go to the same Supabase `leads` table as apps/ai-office/config.js. */
window.SITE = {
  name: 'AI Growth Office',
  leads: {
    send: function (p) {
      var URL = 'https://cslvbnladhfjrdbtnwkm.supabase.co', KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNzbHZibmxhZGhmanJkYnRud2ttIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1ODk2NzYsImV4cCI6MjA5NDE2NTY3Nn0.0VjY3ihxWMjDRBoWpPQiAAKEYRveKKbUHzt4969kATk';
      var row = {
        name: p.name || null, telegram: p.contact || null, email: p.email || null,
        niche: p.niche || null, goal: p.goal || null, main_problem: p.message || null,
        recommended_agents: p.item ? [p.item] : [], source: 'ai_office_noir:' + (p.source || 'form')
      };
      var text = ['*Новая заявка — AI Office (noir)*', '', p.name && '👤 ' + p.name, p.contact && '💬 ' + p.contact, p.email && '📧 ' + p.email,
        p.item && '🤖 ' + p.item, p.niche && '📌 ' + p.niche, p.goal && '🎯 ' + p.goal, p.when && '🕐 ' + p.when, p.message && '📝 ' + p.message, '', 'Форма: ' + p.source + ' · ' + p.page].filter(Boolean).join('\n');
      return Promise.allSettled([
        fetch(URL + '/rest/v1/leads', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: KEY, Authorization: 'Bearer ' + KEY, Prefer: 'return=minimal' }, body: JSON.stringify(row) }),
        fetch('/api/notify-tg', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: text, parse_mode: 'Markdown' }) })
      ]);
    }
  }
};
