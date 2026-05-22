'use client';

import { useState } from 'react';

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
      <form onSubmit={create} className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
        <label className="grid gap-1">
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
          {busy ? 'Creating…' : 'Create key →'}
        </button>
      </form>

      {error && (
        <div className="mono text-[11px] text-pink tracking-wider">/ERROR — {error}</div>
      )}

      {justCreated && (
        <div className="border border-lime bg-surface p-4 grid gap-3">
          <div className="mono text-[10px] tracking-widest uppercase text-lime">
            ✓ key created — copy now, it will not be shown again
          </div>
          <div className="grid gap-2">
            <code className="mono text-[12px] break-all bg-bg border border-border p-3">
              {justCreated.plaintext}
            </code>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => navigator.clipboard.writeText(justCreated.plaintext)}
              >
                ⎘ copy
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setJustCreated(null)}
              >
                hide
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-[2px] bg-border border border-border">
        <div className="bg-bg p-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 mono text-[10px] tracking-widest uppercase text-text-mute">
          <span>name · prefix</span>
          <span>scopes</span>
          <span>last used</span>
          <span>created</span>
          <span></span>
        </div>
        {keys.length === 0 && (
          <div className="bg-bg p-6 font-serif italic text-[13px] text-text-dim text-center">
            Пока нет ключей. Создай первый — и используй его в SDK / curl.
          </div>
        )}
        {keys.map((k) => (
          <div
            key={k.id}
            className="bg-bg p-3 grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center"
          >
            <div className="grid gap-0.5 min-w-0">
              <span className={`font-serif text-[14px] ${k.revokedAt ? 'line-through text-text-mute' : ''}`}>
                {k.name}
              </span>
              <code className="mono text-[10px] text-text-mute truncate">{k.prefix}…</code>
            </div>
            <span className="mono text-[10px] tracking-wider text-text-dim uppercase">{k.scopes}</span>
            <span className="mono text-[10px] tracking-wider text-text-dim">
              {k.lastUsedAt ? new Date(k.lastUsedAt).toISOString().slice(0, 10) : '—'}
            </span>
            <span className="mono text-[10px] tracking-wider text-text-dim">
              {new Date(k.createdAt).toISOString().slice(0, 10)}
            </span>
            {k.revokedAt ? (
              <span className="mono text-[10px] tracking-widest uppercase text-text-mute">revoked</span>
            ) : (
              <button onClick={() => revoke(k.id)} className="btn-ghost text-[11px]">
                revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
