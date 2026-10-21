'use client';

import { useState } from 'react';
import { Check, Copy, EyeOff, KeyRound, RefreshCw } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type CreatedKey = ApiKeyRow & { plaintext: string };

export function ApiKeysManager({ initialKeys }: { initialKeys: ApiKeyRow[] }) {
  const [keys, setKeys] = useState(initialKeys);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<CreatedKey | null>(null);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: name.trim() || 'default' }),
      });
      const j = (await res.json()) as CreatedKey | { error: string };
      if (!res.ok || 'error' in j) {
        setError('error' in j ? j.error : `failed_${res.status}`);
        return;
      }
      setJustCreated(j);
      setKeys([
        {
          id: j.id,
          name: j.name,
          prefix: j.prefix,
          scopes: j.scopes,
          createdAt: j.createdAt,
          lastUsedAt: null,
          revokedAt: null,
        },
        ...keys,
      ]);
      setName('');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!confirm('Отозвать ключ? Все интеграции с ним сразу перестанут работать.')) return;
    const res = await fetch(`/api/keys/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      setError(`revoke_failed_${res.status}`);
      return;
    }
    setKeys(keys.map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
  };

  return (
    <div className="grid gap-6">
      <form onSubmit={create} className="panel p-5 grid gap-3 sm:grid-cols-[1fr_auto] items-end reveal">
        <label className="grid gap-1.5">
          <span className="label">Key name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="my-app / production / staging…"
            maxLength={80}
          />
        </label>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {busy ? 'Creating…' : 'Create key'}
        </button>
      </form>

      {error && (
        <div className="rounded-2xl border border-pink/40 bg-pink/[0.06] px-4 py-2.5 text-[13px] text-pink fade-in">{error}</div>
      )}

      {justCreated && (
        <div className="panel !border-lime/40 !bg-lime/[0.05] p-5 grid gap-3 pop-in">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-lime">
            <Check className="h-4 w-4" />
            key created — copy now, it will not be shown again
          </div>
          <div className="grid gap-2.5">
            <code className="font-mono text-[12.5px] break-all rounded-2xl border border-border-soft bg-black/30 p-3.5 text-text">
              {justCreated.plaintext}
            </code>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-ghost !px-4 !py-2 !text-[13px]"
                onClick={() => navigator.clipboard.writeText(justCreated.plaintext)}
              >
                <Copy className="h-4 w-4" />
                copy
              </button>
              <button
                type="button"
                className="btn-ghost !px-4 !py-2 !text-[13px]"
                onClick={() => setJustCreated(null)}
              >
                <EyeOff className="h-4 w-4" />
                hide
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="panel overflow-x-auto">
        <div className="min-w-[560px]">
        <div className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 border-b border-border-soft label">
          <span>name · prefix</span>
          <span>scopes</span>
          <span>last used</span>
          <span>created</span>
          <span></span>
        </div>
        {keys.length === 0 && (
          <div className="p-8 flex flex-col items-center gap-3 text-[14px] text-text-dim text-center">
            <Icon3D name="keys" size={36} tile />
            Пока нет ключей. Создай первый — и используй его в SDK / curl.
          </div>
        )}
        {keys.map((k) => (
          <div
            key={k.id}
            className="px-5 py-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center border-b border-border-soft last:border-b-0 transition-colors hover:bg-white/[0.03]"
          >
            <div className="grid gap-0.5 min-w-0">
              <span className={`text-[14px] font-medium ${k.revokedAt ? 'line-through text-text-mute' : 'text-text'}`}>
                {k.name}
              </span>
              <code className="font-mono text-[11px] text-text-mute truncate">{k.prefix}…</code>
            </div>
            <span className="rounded-full bg-white/[0.06] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.04em] text-text-dim">{k.scopes}</span>
            <span className="text-[12px] tabular-nums text-text-dim">
              {k.lastUsedAt ? new Date(k.lastUsedAt).toISOString().slice(0, 10) : '—'}
            </span>
            <span className="text-[12px] tabular-nums text-text-dim">
              {new Date(k.createdAt).toISOString().slice(0, 10)}
            </span>
            {k.revokedAt ? (
              <span className="status-badge text-text-mute">revoked</span>
            ) : (
              <button type="button" onClick={() => revoke(k.id)} className="btn-ghost !px-3.5 !py-1.5 !text-[12px] hover:!text-pink hover:!border-pink/40">
                revoke
              </button>
            )}
          </div>
        ))}
        </div>
      </div>
    </div>
  );
}
