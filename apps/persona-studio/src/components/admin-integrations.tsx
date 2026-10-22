'use client';

// «Админ → Интеграции»: paste provider keys / SMTP from the browser. Values go
// to /api/admin/integrations and are live within ~30 s in every process.

import { useState } from 'react';
import { Check, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { errorText, exceptionText } from '@/lib/error-text';

export type IntegrationItem = {
  key: string;
  label: string;
  purpose: string;
  url?: string;
  secret: boolean;
  group: string;
  restart?: boolean;
  configured: boolean;
  source: 'admin' | 'env' | null;
  preview: string | null;
};

const GROUP_LABEL: Record<string, string> = {
  generation: 'Генерация',
  text: 'Тексты',
  voice: 'Голос',
  research: 'Ресёрч',
  publish: 'Публикация',
  billing: 'Оплата',
  mail: 'Почта для входа',
};

export function AdminIntegrations({ initialItems }: { initialItems: IntegrationItem[] }) {
  const [items, setItems] = useState(initialItems);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function save(key: string, value: string) {
    setBusy(key);
    setError(null);
    setSaved(null);
    try {
      const res = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, value }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorText(data, res.status));
      setItems(data.items);
      setDrafts((d) => ({ ...d, [key]: '' }));
      setSaved(key);
    } catch (e) {
      setError(exceptionText(e));
    } finally {
      setBusy(null);
    }
  }

  const groups = [...new Set(items.map((i) => i.group))];
  const connected = items.filter((i) => i.configured).length;

  return (
    <div className="grid gap-5">
      <p className="text-[14px] text-text-dim">
        Подключено {connected} из {items.length}. Ключ начинает работать в течение 30 секунд — перезапуск не нужен
        (кроме почты).
      </p>
      {error && <p className="rounded-2xl border border-danger/40 bg-danger/[0.08] px-4 py-2.5 text-[13px] text-danger">{error}</p>}
      {groups.map((g) => (
        <div key={g} className="grid gap-2.5">
          <div className="label">{GROUP_LABEL[g] ?? g}</div>
          <div className="grid gap-2.5 lg:grid-cols-2">
            {items
              .filter((i) => i.group === g)
              .map((i) => {
                const draft = drafts[i.key] ?? '';
                return (
                  <div key={i.key} className="panel grid gap-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-0.5">
                        <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-text">
                          {i.label}
                          {i.url && (
                            <a
                              href={i.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-text-mute hover:text-gold"
                              aria-label={`Где взять ключ ${i.label}`}
                            >
                              <ExternalLink size={13} />
                            </a>
                          )}
                        </span>
                        <span className="text-[12px] text-text-mute">{i.purpose}</span>
                      </div>
                      <span className={`status-badge ${i.configured ? 'status-ready' : 'status-queued'}`}>
                        {i.configured ? 'подключён' : 'нет ключа'}
                      </span>
                    </div>
                    {i.configured && (
                      <div className="flex items-center justify-between gap-2 text-[12px] text-text-mute">
                        <span className="font-mono">{i.preview}</span>
                        <span className="flex items-center gap-2">
                          {i.source === 'env' ? 'из .env на сервере' : 'задан здесь'}
                          {i.source === 'admin' && (
                            <button
                              type="button"
                              onClick={() => save(i.key, '')}
                              disabled={busy === i.key}
                              className="btn-icon !h-7 !w-7"
                              aria-label={`Удалить ${i.label}`}
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </span>
                      </div>
                    )}
                    <form
                      className="flex gap-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (draft.trim()) void save(i.key, draft);
                      }}
                    >
                      <input
                        type={i.secret ? 'password' : 'text'}
                        autoComplete="off"
                        value={draft}
                        onChange={(e) => setDrafts((d) => ({ ...d, [i.key]: e.target.value }))}
                        placeholder={i.configured ? 'Заменить значение' : 'Вставьте значение'}
                        className="input flex-1 !py-2 text-[13px]"
                        aria-label={i.label}
                      />
                      <button type="submit" disabled={!draft.trim() || busy === i.key} className="btn-primary !px-4 !py-2 text-[13px]">
                        {busy === i.key ? <Loader2 size={14} className="animate-spin" /> : saved === i.key ? <Check size={14} /> : null}
                        Сохранить
                      </button>
                    </form>
                    {i.restart && i.configured && (
                      <p className="text-[12px] text-text-mute">Почта применится после перезапуска сайта.</p>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
}
