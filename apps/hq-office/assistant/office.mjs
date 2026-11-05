/* What the assistant knows about the office: the same data files the site loads
   (office.config.js, dept-content.js, agent-content.js, tasks.js, tasks.auto.js, works.js),
   turned into one Russian text block for the system prompt. Rebuilt when a file changes
   (a deploy switches /opt/hq-office/current) and when the day changes (the 7-day digest).
   Everything here is already public on hq2.aicex.club, so guests get the same block. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const FILES = ['agents.js', 'office.config.js', 'dept-content.js', 'agent-content.js', 'skills-library.js', 'tasks.js', 'tasks.auto.js', 'works.js'];
const SITE = 'https://hq2.aicex.club';
const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const KIND = { github:'GitHub', claude:'Claude', site:'сайт', file:'файл' };

export const moscowDate = (d = new Date()) => new Intl.DateTimeFormat('sv-SE', { timeZone:'Europe/Moscow' }).format(d);
export const humanDate = iso => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}`; };

let cache = { key:'', office:null, W:null };
// the owner's admin panel patch over agents.js (assistant/admin.mjs): () => ({ patch, stamp })
let patchSource = null;
export function setOfficePatch(fn) { patchSource = fn; }

export function loadOffice(dir) {
  const stamps = FILES.map(f => { try { return fs.statSync(path.join(dir, f)).mtimeMs; } catch { return 0; } });
  let real = dir;
  try { real = fs.realpathSync(dir); } catch {}
  const P = patchSource?.() || null;
  const key = [real, ...stamps, moscowDate(), P?.stamp || 0].join('|');
  if (cache.key === key) return cache.office;
  const ctx = vm.createContext({ window:{} });
  for (const f of FILES) {
    const p = path.join(dir, f);
    if (fs.existsSync(p)) vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename:f });
    if (f === 'agents.js' && P?.patch) ctx.window.OFFICE_AGENTS?.apply?.(JSON.parse(JSON.stringify(P.patch)));
  }
  cache = { key, office:buildOffice(ctx.window), W:ctx.window };
  return cache.office;
}

// The raw data of the site (window.OFFICE_CONFIG, AGENT_CONTENT, …) — the desk dispatcher reads agents from it
export function officeWindow(dir) {
  loadOffice(dir);
  return cache.W;
}

function buildOffice(W) {
  const CFG = W.OFFICE_CONFIG || { depts:[], products:[] }, CAT = W.AGENT_CATALOG || {}, AC = W.AGENT_CONTENT || {}, HC = W.HEAD_CONTENT || {};
  const EXTRA = W.OFFICE_WORKS?.agents || {};
  const manual = W.OFFICE_TASKS || [], auto = W.OFFICE_TASKS_AUTO?.tasks || [];
  const tasks = [...manual, ...auto.filter(t => !manual.some(m => m.id === t.id))].sort((a, b) => b.date.localeCompare(a.date));
  const agentName = id => CAT[id]?.name || id;
  const dept = id => CFG.depts.find(d => d.id === id);
  const tasksOf = id => tasks.filter(t => (t.agents || []).includes(id));
  const today = moscowDate(), weekAgo = moscowDate(new Date(Date.now() - 7 * 864e5));

  const out = [`# Офис ${CFG.brand || ''}: живой офис агентов ${SITE}`,
    'Отделы, руководители и ИИ-агенты (id агента в скобках). Досье агента: ' + SITE + '/#agent-<id>, его готовые работы: ' + SITE + '/#agent-<id>/works.'];
  for (const d of CFG.depts) {
    out.push('', `## ${d.name} — ${d.head.name}, ${d.head.title}`);
    if (HC[d.id]?.lead) out.push(HC[d.id].lead);
    if (HC[d.id]?.products?.length) out.push(`Продукты руководителя (${d.head.name}): ${HC[d.id].products.map(p => `${p.title} — ${p.url} — ${p.note || ''}`).join('; ')}`);
    for (const id of d.agents) {
      const c = AC[id] || {}, n = tasksOf(id).length;
      const skills = (c.skills || []).slice(0, 6).map(s => s.title).join(', ');
      out.push(`- ${agentName(id)} (${id}): ${CAT[id]?.role || ''}. ${c.lead || ''} Задач в истории: ${n}.${skills ? ' Скиллы: ' + skills + '.' : ''}`);
    }
  }
  // the office of «Нейроворонка» — the third style of the site: its own team of the campaign, subordinate to the main office
  if (CFG.neuro && W.OFFICE_AGENTS?.ofContour) {
    out.push('', `## ${CFG.neuro.name} — отдельный офис кампании Нейроворонки (стиль сайта ${SITE}/?theme=neuro, кабинет с цифрами — ${SITE}/${CFG.neuro.cabinet}). Своя команда в шести контурах, руководители те же, что в главном офисе; работает сам (каждое утро Штаб кампании разбирает цифры и раздаёт находки агентам) и подчиняется главному офису: задачи идут через общий рабочий стол, результат — на проверку Илье.`);
    for (const c of CFG.neuro.contours) {
      out.push(`### Контур «${c.name}» — ${c.about}`);
      for (const id of W.OFFICE_AGENTS.ofContour(c.id)) out.push(`- ${agentName(id)} (${id}): ${CAT[id]?.role || ''}. ${AC[id]?.lead || ''}`);
    }
  }
  if (CFG.council?.agents?.length) {
    out.push('', `## ${CFG.council.name} — отдельная комната: ИИ-советники по методам легенд бизнеса (скилл «Команда 8 легенд»). Туда отправляют на собеседование и на исправление деталей — задачей через create_task.`);
    for (const id of [CFG.council.board, ...CFG.council.agents].filter(Boolean)) out.push(`- ${agentName(id)} (${id}): ${CAT[id]?.role || ''}. ${AC[id]?.lead || ''}`);
  }
  if (CFG.products?.length) {
    out.push('', '## Продукты компании');
    for (const p of CFG.products) out.push(`- ${p.title} — ${p.url} — ${p.note || ''}`);
  }

  // short digest: what a spoken status report is built from
  const week = tasks.filter(t => t.date >= weekAgo);
  const idle = CFG.depts.flatMap(d => d.agents).filter(id => !tasksOf(id).length && !(AC[id]?.results || []).length && !(AC[id]?.artifacts || []).length && !EXTRA[id]);
  out.push('', `## Сводка на ${humanDate(today)}`,
    `- Всего задач в истории: ${tasks.length}${tasks.length ? `, с ${humanDate(tasks[tasks.length - 1].date)} по ${humanDate(tasks[0].date)}` : ''}.`,
    `- За последние 7 дней: ${week.length}${week.length ? ' — ' + week.map(t => `«${t.title}» (${dept(t.dept)?.name || t.dept}, ${humanDate(t.date)})`).join('; ') : ''}.`);
  for (const d of CFG.depts) {
    const list = tasks.filter(t => t.dept === d.id);
    out.push(`- ${d.name}: ${list.length} задач${list.length ? `, последняя ${humanDate(list[0].date)}` : ''}.`);
  }
  out.push(`- Агенты без готовых результатов: ${idle.length ? idle.map(agentName).join(', ') : 'нет'}.`);

  out.push('', '## История реальных задач (новые сверху)', 'У каждой задачи есть проверяемая ссылка-доказательство; задача открывается по адресу ' + SITE + '/#task-<id>.');
  for (const t of tasks) {
    const proofs = (t.proof || []).map(p => `${p.label} (${KIND[p.kind] || p.kind})`).join(', ');
    const media = (t.media || []).length ? ` Материалы: ${(t.media || []).map(m => m.title).join(', ')}.` : '';
    out.push(`- ${t.date} · ${dept(t.dept)?.name || t.dept} · ${t.kind} · агенты: ${(t.agents || []).map(agentName).join(', ')} · id ${t.id}`,
      `  ${t.title}. ${t.summary || ''} Доказательства: ${proofs}.${media}`);
  }
  return { text:out.join('\n'), tasks:tasks.length, week:week.length };
}

// Project map for the owner: the product table of the monorepo CLAUDE.md
// (statuses, milestones, prod addresses). Copied next to the server at deploy time.
export function loadProjectMap(file) {
  let md = '';
  try { md = fs.readFileSync(file, 'utf8'); } catch { return ''; }
  const from = md.indexOf('## Product → path map'), to = md.indexOf('## When Claude is asked');
  return from >= 0 ? md.slice(from, to > from ? to : undefined).trim() : '';
}
