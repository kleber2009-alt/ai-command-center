/* Login of the CRM: a few people, each with a password from the environment (CRM_USERS_JSON, or CRM_OWNER_PASSWORD and
   CRM_BOGDAN_PASSWORD). The session is a signed cookie, 30 days. */
import crypto from 'node:crypto';
import { meta } from './db.mjs';

export function loadUsers(env = process.env) {
  const users = {};
  if (env.CRM_USERS_JSON) {
    try {
      for (const [login, u] of Object.entries(JSON.parse(env.CRM_USERS_JSON))) if (u?.password) users[login] = { login, name:u.name || login, role:u.role || 'manager', password:u.password };
    } catch { console.error('CRM_USERS_JSON is not valid JSON — ignored'); }
  }
  if (env.CRM_OWNER_PASSWORD && !users.ilia) users.ilia = { login:'ilia', name:'Илья', role:'owner', password:env.CRM_OWNER_PASSWORD };
  if (env.CRM_BOGDAN_PASSWORD && !users.bogdan) users.bogdan = { login:'bogdan', name:'Богдан', role:'head', password:env.CRM_BOGDAN_PASSWORD };
  return users;
}

const COOKIE = 'dcrm';
const DAYS = 30;

export function createAuth({ db, users, secret }) {
  const key = secret || meta(db, 'session_secret') || (() => { const s = crypto.randomBytes(32).toString('hex'); meta(db, 'session_secret', s); return s; })();
  const sign = s => crypto.createHmac('sha256', key).update(s).digest('base64url');
  const tries = new Map();

  function check(login, password, ip) {
    const t = tries.get(ip) || { n:0, at:Date.now() };
    if (Date.now() - t.at > 15 * 60e3) { t.n = 0; t.at = Date.now(); }
    if (t.n >= 10) return { error:'Слишком много попыток — подождите 15 минут' };
    const u = users[String(login || '').trim().toLowerCase()];
    const ok = u && password && crypto.timingSafeEqual(crypto.createHash('sha256').update(String(password)).digest(), crypto.createHash('sha256').update(u.password).digest());
    if (!ok) { t.n++; tries.set(ip, t); return { error:'Неверный логин или пароль' }; }
    tries.delete(ip);
    return { user:u };
  }

  function cookieFor(u, secure) {
    const exp = Math.floor(Date.now() / 1000) + DAYS * 86400;
    const v = `${u.login}.${exp}`;
    return `${COOKIE}=${v}.${sign(v)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${DAYS * 86400}${secure ? '; Secure' : ''}`;
  }

  function userOf(req) {
    const raw = (req.headers.cookie || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
    if (!raw) return null;
    const [login, exp, sig] = raw.slice(COOKIE.length + 1).split('.');
    if (!login || !exp || !sig) return null;
    const want = sign(`${login}.${exp}`);
    if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    if (Number(exp) < Date.now() / 1000) return null;
    const u = users[login];
    return u ? { login:u.login, name:u.name, role:u.role } : null;
  }

  return { check, cookieFor, userOf, clear:`${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` };
}
