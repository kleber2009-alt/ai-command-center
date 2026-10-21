'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatDate } from '@/lib/utils';

type AdminUser = {
  id: string;
  email: string;
  name: string | null;
  tokenBalance: number;
  plan: string;
  role: string;
  createdAt: string;
  _count: {
    avatarGenerations: number;
    covers: number;
    videoGenerations: number;
  };
};

const QUICK_GRANTS = [10, 30, 100, 500, 1000];

export function AdminUsersPanel({ initialUsers, currentUserId }: { initialUsers: AdminUser[]; currentUserId: string }) {
  const [users, setUsers] = useState<AdminUser[]>(initialUsers);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);

  const refresh = useCallback(async (search: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users?q=${encodeURIComponent(search)}`);
      if (res.ok) {
        const data = (await res.json()) as { users: AdminUser[] };
        setUsers(data.users);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => refresh(q.trim()), 250);
    return () => clearTimeout(t);
  }, [q, refresh]);

  const grant = async (userId: string, amount: number) => {
    setBusyId(userId);
    setErr(null);
    setFlash(null);
    try {
      const res = await fetch('/api/admin/credit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, amount }),
      });
      const j = (await res.json()) as { ok?: boolean; user?: { email: string; tokenBalance: number }; error?: string };
      if (!res.ok || !j.ok) {
        setErr(j.error ?? `http_${res.status}`);
      } else if (j.user) {
        setFlash(`${j.user.email} → ${j.user.tokenBalance} токенов (${amount > 0 ? '+' : ''}${amount})`);
        setUsers((prev) => prev.map((u) => (u.id === userId ? { ...u, tokenBalance: j.user!.tokenBalance } : u)));
      }
    } catch (e) {
      setErr(String(e));
    } finally {
      setBusyId(null);
    }
  };

  const grantCustom = async (userId: string) => {
    const raw = window.prompt('Сколько токенов начислить? (отрицательное — списать; 0 нельзя)');
    if (!raw) return;
    const amount = Number(raw);
    if (!Number.isInteger(amount) || amount === 0) {
      setErr('Введи целое число ≠ 0');
      return;
    }
    grant(userId, amount);
  };

  return (
    <div className="grid gap-4">
      <div className="panel flex flex-wrap items-center gap-4 p-4">
        <input
          type="text"
          placeholder="Поиск: email, имя или id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="input !rounded-full flex-1 min-w-[200px]"
        />
        <span className="text-[13px] tabular-nums text-text-mute">
          {loading ? '/loading…' : `${users.length} users`}
        </span>
      </div>

      {(err || flash) && (
        <div className="rounded-2xl border border-border-soft bg-white/[0.04] px-4 py-2.5 text-[13px] fade-in">
          {flash && <span className="text-lime">/OK — {flash}</span>}
          {err && <span className="text-pink">/ERROR — {err}</span>}
        </div>
      )}

      <div className="panel overflow-x-auto">
        <div className="min-w-[760px]">
        <div className="grid grid-cols-[1fr_90px_90px_120px_1fr] gap-3 px-5 py-3 border-b border-border-soft label">
          <span>User</span>
          <span className="text-right">Balance</span>
          <span className="text-right">Plan</span>
          <span>Activity</span>
          <span>Grant tokens</span>
        </div>

        {users.length === 0 ? (
          <div className="px-5 py-6 text-[13px] text-text-mute">
            /EMPTY
          </div>
        ) : (
          users.map((u) => (
            <div
              key={u.id}
              className={`grid grid-cols-[1fr_90px_90px_120px_1fr] gap-3 px-5 py-3 items-center border-b border-border-soft last:border-b-0 hover:bg-white/[0.03] transition-colors ${
                u.id === currentUserId ? 'bg-lime/[0.04]' : ''
              }`}
            >
              <div className="grid">
                <span className="text-[14.5px] font-medium text-text truncate">
                  {u.name || u.email}
                  {u.role === 'admin' && <span className="ml-2 rounded-full bg-pink/15 px-2 py-0.5 text-[10px] font-semibold text-pink">ADMIN</span>}
                  {u.id === currentUserId && <span className="ml-2 rounded-full bg-lime/15 px-2 py-0.5 text-[10px] font-semibold text-lime">YOU</span>}
                </span>
                <span className="text-[12px] text-text-mute truncate">{u.email}</span>
                <span className="font-mono text-[10.5px] text-text-mute/70">
                  {u.id.slice(0, 14)} · {formatDate(u.createdAt)}
                </span>
              </div>

              <div className="text-[22px] font-extrabold tabular-nums tracking-[-0.02em] text-lime text-right leading-none">{u.tokenBalance}</div>
              <div className="text-[12px] font-medium uppercase text-text-dim text-right">{u.plan}</div>
              <div className="text-[12px] tabular-nums text-text-mute">
                {u._count.avatarGenerations}b · {u._count.covers}c · {u._count.videoGenerations}v
              </div>

              <div className="flex flex-wrap gap-1.5">
                {QUICK_GRANTS.map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    disabled={busyId === u.id}
                    onClick={() => grant(u.id, amt)}
                    className="rounded-full border border-border-soft bg-white/[0.04] px-3 py-1 text-[12px] font-medium tabular-nums text-text-dim hover:border-lime/50 hover:bg-lime/[0.08] hover:text-lime transition-colors disabled:opacity-40"
                  >
                    +{amt}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busyId === u.id}
                  onClick={() => grantCustom(u.id)}
                  className="rounded-full border border-border-soft bg-white/[0.04] px-3 py-1 text-[12px] text-text-dim hover:bg-white/[0.08] hover:text-text transition-colors disabled:opacity-40"
                >
                  custom
                </button>
              </div>
            </div>
          ))
        )}
        </div>
      </div>
    </div>
  );
}
