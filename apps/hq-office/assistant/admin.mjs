/* The owner's admin panel: changes to the office team without a deploy.

   DATA_DIR/office-patch.json — the patch over the agent registry (agents.js, window.OFFICE_AGENTS.apply):
     added       { id: { dept, name, role, color, screen, tasks } } — new agents
     agents      { id: { name?, role?, color?, dept? } }             — edits of existing ones (a new department moves them)
     vacation    [ids] — «в отпуске»: out of the office and the dispatcher, history and dossier keep them
     removed     [ids] — removed: the same, until restored (an added agent is deleted for good)
     hiddenTasks [ids] — tasks the guests do not see (history ids, desk tasks as desk-<id>)
   The site loads it as GET /api/assistant/office/patch.js right after agents.js; office.mjs applies the same
   patch for the assistant and the dispatcher's catalog. DATA_DIR/admin-log.json — who did what (last 500). */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const DEPTS = ['ceo', 'marketing', 'sales', 'traffic'];
const SCREENS = ['code', 'chart', 'doc', 'media', 'flow', 'chat', 'ads', 'calendar'];

export function initAdmin(dataDir) {
  const FILE = path.join(dataDir, 'office-patch.json'), LOG = path.join(dataDir, 'admin-log.json');
  const read = (f, d) => { try { return { ...d, ...JSON.parse(fs.readFileSync(f, 'utf8')) }; } catch { return d; } };
  let patch = read(FILE, { added:{}, agents:{}, vacation:[], removed:[], hiddenTasks:[] });
  let log = read(LOG, { items:[] }).items;
  let stamp = Date.now();
  const write = (f, v) => { fs.mkdirSync(dataDir, { recursive:true }); fs.writeFileSync(f + '.tmp', JSON.stringify(v, null, 1)); fs.renameSync(f + '.tmp', f); };
  const save = () => { write(FILE, patch); stamp = Date.now(); };
  const note = (who, text) => { log.unshift({ at:new Date().toISOString(), who, text }); log = log.slice(0, 500); write(LOG, { items:log }); };
  const str = (v, n) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, n);
  const without = (arr, id) => arr.filter(x => x !== id);

  // base: the agent registry with the patch applied ({ list, away }) — to check ids and names
  function act(b, who, base) {
    const id = String(b.id || ''), known = base.list[id] || base.away[id], name = known?.name || patch.added[id]?.name || id;
    switch (b.action) {
      case 'create': {
        const n = str(b.name, 40), role = str(b.role, 140);
        if (!n || !role) throw new Error('Нужны имя и роль агента.');
        if (!DEPTS.includes(b.dept)) throw new Error('Выберите отдел.');
        const nid = 'ag-' + crypto.randomBytes(3).toString('hex');
        const tasks = (Array.isArray(b.tasks) ? b.tasks : String(b.tasks || '').split('\n')).map(x => str(x, 90)).filter(Boolean).slice(0, 5);
        patch.added[nid] = { dept:b.dept, name:n, role, color:/^#[0-9a-f]{6}$/i.test(b.color) ? b.color : '#7fd3ff',
          screen:SCREENS.includes(b.screen) ? b.screen : 'doc', tasks:tasks.length ? tasks : ['Ждёт первую задачу'], created:new Date().toISOString() };
        save(); note(who, `создал агента «${n}» в отделе ${b.dept}`);
        return { id:nid };
      }
      case 'edit': {
        if (!known) throw new Error('Нет такого агента.');
        const e = {};
        if (b.name) e.name = str(b.name, 40);
        if (b.role) e.role = str(b.role, 140);
        if (/^#[0-9a-f]{6}$/i.test(b.color || '')) e.color = b.color;
        if (b.dept) { if (!DEPTS.includes(b.dept)) throw new Error('Нет такого отдела.'); e.dept = b.dept; }
        if (patch.added[id]) Object.assign(patch.added[id], e);
        else patch.agents[id] = { ...(patch.agents[id] || {}), ...e };
        save(); note(who, `изменил агента «${name}»: ${Object.entries(e).map(([k, v]) => `${{ name:'имя', role:'роль', color:'цвет', dept:'отдел' }[k]} → ${v}`).join(', ')}`);
        return {};
      }
      case 'vacation': {
        if (!known) throw new Error('Нет такого агента.');
        patch.vacation = b.on ? [...without(patch.vacation, id), id] : without(patch.vacation, id);
        save(); note(who, b.on ? `отправил «${name}» в отпуск` : `вернул «${name}» из отпуска`);
        return {};
      }
      case 'remove': {
        if (!known) throw new Error('Нет такого агента.');
        if (patch.added[id]) { delete patch.added[id]; patch.vacation = without(patch.vacation, id); note(who, `удалил агента «${name}»`); }
        else { patch.removed = [...without(patch.removed, id), id]; patch.vacation = without(patch.vacation, id); note(who, `убрал агента «${name}» из офиса`); }
        save(); return {};
      }
      case 'restore': {
        patch.removed = without(patch.removed, id); patch.vacation = without(patch.vacation, id);
        save(); note(who, `вернул агента «${name}» в офис`); return {};
      }
      case 'hideTask': {
        const tid = str(b.id, 80); if (!tid) throw new Error('Нет задачи.');
        patch.hiddenTasks = b.on ? [...without(patch.hiddenTasks, tid), tid] : without(patch.hiddenTasks, tid);
        save(); note(who, `${b.on ? 'скрыл от гостей' : 'показал гостям'} задачу «${str(b.title, 90) || tid}»`); return {};
      }
      default: throw new Error('Неизвестное действие.');
    }
  }

  return {
    act, note,
    patch:() => patch,
    stamp:() => stamp,
    log:(n = 200) => log.slice(0, n),
    script:() => `window.OFFICE_AGENTS && window.OFFICE_AGENTS.apply(${JSON.stringify(patch)});\n`,
    hiddenTask:id => patch.hiddenTasks.includes(id),
  };
}
