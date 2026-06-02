'use client';

import { useState } from 'react';

/** Admin login form (client). Posts to /api/admin/login then reloads. */
export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json?.error?.message ?? 'Ошибка входа');
      window.location.reload();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50">
      <form onSubmit={submit} className="w-80 space-y-4 rounded-lg border border-neutral-200 bg-white p-6">
        <div className="text-lg font-semibold">Club Der Denker — вход</div>
        <input
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm"
          type="password"
          placeholder="Пароль"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error ? <div className="text-sm text-red-600">{error}</div> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-md bg-neutral-900 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Войти
        </button>
      </form>
    </div>
  );
}
