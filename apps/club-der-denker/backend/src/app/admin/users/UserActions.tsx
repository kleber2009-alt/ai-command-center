'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/** Block / unblock toggle for a user row (spec 6). */
export function UserActions({ userId, status }: { userId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const blocked = status === 'blocked';

  async function toggle() {
    setBusy(true);
    await fetch('/api/admin/users', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ userId, action: blocked ? 'unblock' : 'block' }),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <button onClick={toggle} disabled={busy} className={`rounded-md px-2 py-1 text-xs ${blocked ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} disabled:opacity-50`}>
      {blocked ? 'Разблокировать' : 'Заблокировать'}
    </button>
  );
}
