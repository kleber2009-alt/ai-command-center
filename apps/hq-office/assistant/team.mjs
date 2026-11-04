/* Team: department heads with access to the office (invite link → their own login).

   A head manages only the agents the owner gave them: sets tasks to them, answers their questions,
   accepts results and allows their actions in external systems. Other departments they see read-only.
   The owner keeps everything else (the twin, the assistant's memory, the team itself).

   Storage: DATA_DIR/team.json — { users:[{ id, name, dept, agents:[ids], ver, disabled, created, lastSeen }],
   invites:[{ code, user, exp, used }] }. The login cookie holds `user.<id>.<ver>.<exp>` signed by the server;
   disabling a head or issuing a new link bumps `ver`, so old cookies stop working at once. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const INVITE_DAYS = 7, LOGIN_DAYS = 90;

export function initTeam(dataDir) {
  const FILE = path.join(dataDir, 'team.json');
  let db = { users:[], invites:[] };
  try { db = { users:[], invites:[], ...JSON.parse(fs.readFileSync(FILE, 'utf8')) }; } catch {}
  const save = () => { fs.mkdirSync(dataDir, { recursive:true }); fs.writeFileSync(FILE + '.tmp', JSON.stringify(db, null, 1)); fs.renameSync(FILE + '.tmp', FILE); };
  const now = () => new Date().toISOString();
  const get = id => db.users.find(u => u.id === id) || null;
  const clean = s => String(s || '').trim().slice(0, 60);
  const cleanId = s => String(s || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);

  // public view for the owner's team screen (no codes of used or expired invites)
  const view = u => ({ id:u.id, name:u.name, dept:u.dept, agents:u.agents, disabled:Boolean(u.disabled), created:u.created, lastSeen:u.lastSeen || '',
    invite:(() => { const i = db.invites.filter(x => x.user === u.id && !x.used && Date.parse(x.exp) > Date.now()).at(-1); return i ? { exp:i.exp } : null; })() });

  return {
    list:() => db.users.map(view),
    get,
    // the owner adds (or updates) a head and gets a fresh one-time link; older links and cookies of this head stop working
    invite({ id, name, dept, agents }) {
      id = cleanId(id); if (!id) throw new Error('Нет id сотрудника.');
      let u = get(id);
      if (!u) { u = { id, name:clean(name) || id, dept:clean(dept), agents:[], ver:1, disabled:false, created:now() }; db.users.push(u); }
      if (name) u.name = clean(name);
      if (dept) u.dept = clean(dept);
      if (Array.isArray(agents)) u.agents = [...new Set(agents.map(cleanId).filter(Boolean))];
      u.ver = (u.ver || 1) + 1; u.disabled = false;
      db.invites = db.invites.filter(x => x.user !== id && Date.parse(x.exp) > Date.now() - 30 * 864e5);
      const code = crypto.randomBytes(18).toString('base64url');
      db.invites.push({ code, user:id, exp:new Date(Date.now() + INVITE_DAYS * 864e5).toISOString(), used:false });
      save();
      return { code, user:view(u) };
    },
    update(id, { name, agents, disabled }) {
      const u = get(cleanId(id)); if (!u) return null;
      if (name) u.name = clean(name);
      if (Array.isArray(agents)) u.agents = [...new Set(agents.map(cleanId).filter(Boolean))];
      if (typeof disabled === 'boolean' && disabled !== Boolean(u.disabled)) { u.disabled = disabled; u.ver = (u.ver || 1) + 1; }
      save();
      return view(u);
    },
    remove(id) {
      const n = db.users.length;
      db.users = db.users.filter(u => u.id !== id); db.invites = db.invites.filter(x => x.user !== id);
      if (db.users.length !== n) save();
      return db.users.length !== n;
    },
    // the invite link was opened: returns the cookie value to sign, or null
    redeem(code) {
      const i = db.invites.find(x => x.code === String(code || ''));
      if (!i || i.used || Date.parse(i.exp) < Date.now()) return null;
      const u = get(i.user); if (!u || u.disabled) return null;
      i.used = true; u.lastSeen = now(); save();
      return { user:u, value:`user.${u.id}.${u.ver}.${Date.now() + LOGIN_DAYS * 864e5}` };
    },
    // a signed cookie value → the head, if still valid
    check(value) {
      const [kind, id, ver, exp] = String(value || '').split('.');
      if (kind !== 'user' || Number(exp) < Date.now()) return null;
      const u = get(id);
      if (!u || u.disabled || String(u.ver) !== ver) return null;
      if (!u.lastSeen || Date.now() - Date.parse(u.lastSeen) > 36e5) { u.lastSeen = now(); save(); }
      return u;
    },
    LOGIN_DAYS,
  };
}
