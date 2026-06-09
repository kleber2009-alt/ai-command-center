'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Send,
  Trash2,
  Plus,
  Instagram,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Link2,
} from 'lucide-react';

type Target = {
  id: string;
  platform: string;
  status: string;
  permalink: string | null;
  errorMsg: string | null;
  channel: string;
};

type Post = {
  id: string;
  status: string;
  caption: string | null;
  mediaUrl: string;
  scheduledAt: string;
  publishedAt: string | null;
  errorMsg: string | null;
  targets: Target[];
};

type Account = {
  id: string;
  platform: string;
  displayName: string;
  externalId: string;
  status: string;
  tokenExpiresAt: string | null;
};

type IgAccount = {
  accountId: number;
  projectId: number;
  projectName: string;
  name: string;
  login: string | null;
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const STATUS_LABEL: Record<string, string> = {
  draft: 'черновик',
  scheduled: 'запланирован',
  publishing: 'публикуется',
  published: 'опубликован',
  partial: 'частично',
  failed: 'ошибка',
  canceled: 'отменён',
};

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'published'
      ? 'text-emerald-400'
      : status === 'failed'
        ? 'text-red-400'
        : status === 'partial'
          ? 'text-amber-400'
          : status === 'publishing'
            ? 'text-cyan-400'
            : 'text-text-muted';
  return (
    <span className={`mono text-[10px] uppercase tracking-[0.18em] ${color}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === 'instagram') return <Instagram size={13} />;
  if (platform === 'telegram') return <Send size={13} />;
  return <Link2 size={13} />;
}

export function ScheduleClient({
  initialPosts,
  initialAccounts,
  igReady,
  tgReady,
}: {
  initialPosts: Post[];
  initialAccounts: Account[];
  igReady: boolean;
  tgReady: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [accounts, setAccounts] = useState<Account[]>(initialAccounts);
  const [chatId, setChatId] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [igAccounts, setIgAccounts] = useState<IgAccount[]>([]);
  const [igLoading, setIgLoading] = useState(false);
  const [igPickerOpen, setIgPickerOpen] = useState(false);
  const [, startTransition] = useTransition();

  async function connectTelegram() {
    if (!chatId.trim()) return;
    setConnecting(true);
    setError(null);
    const res = await fetch('/api/schedule/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'telegram', chatId: chatId.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    setConnecting(false);
    if (!res.ok) {
      setError(json.message || json.error || `HTTP ${res.status}`);
      return;
    }
    setAccounts((a) => [json.account, ...a.filter((x) => x.id !== json.account.id)]);
    setChatId('');
  }

  // ── Instagram via PostMyPost ──────────────────
  async function loadIgAccounts() {
    setIgLoading(true);
    setError(null);
    const res = await fetch('/api/schedule/accounts/postmypost');
    const json = await res.json().catch(() => ({}));
    setIgLoading(false);
    if (!res.ok) {
      setError(
        json.error === 'not_configured'
          ? 'PostMyPost не настроен (нет POSTMYPOST_API_TOKEN)'
          : json.message || json.error || `HTTP ${res.status}`,
      );
      return;
    }
    setIgAccounts(json.accounts ?? []);
    setIgPickerOpen(true);
  }

  async function connectIg(acc: IgAccount) {
    setConnecting(true);
    setError(null);
    const res = await fetch('/api/schedule/accounts/postmypost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        accountId: acc.accountId,
        projectId: acc.projectId,
        displayName: acc.login ? `@${acc.login}` : acc.name,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setConnecting(false);
    if (!res.ok) {
      setError(json.message || json.error || `HTTP ${res.status}`);
      return;
    }
    setAccounts((a) => [json.account, ...a.filter((x) => x.id !== json.account.id)]);
    setIgPickerOpen(false);
  }

  function disconnect(id: string) {
    setBusy(id);
    startTransition(async () => {
      const res = await fetch(`/api/schedule/accounts/${id}`, { method: 'DELETE' });
      setBusy(null);
      if (res.ok) setAccounts((a) => a.filter((x) => x.id !== id));
    });
  }

  function publishNow(id: string) {
    setBusy(id);
    startTransition(async () => {
      const res = await fetch(`/api/schedule/posts/${id}/publish-now`, { method: 'POST' });
      setBusy(null);
      if (res.ok) {
        setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, status: 'publishing' } : p)));
      }
    });
  }

  function cancel(id: string) {
    setBusy(id);
    startTransition(async () => {
      const res = await fetch(`/api/schedule/posts/${id}`, { method: 'DELETE' });
      setBusy(null);
      if (res.ok) {
        setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, status: 'canceled' } : p)));
      }
    });
  }

  const upcoming = posts.filter((p) => ['scheduled', 'publishing', 'draft'].includes(p.status));
  const done = posts.filter((p) => ['published', 'partial'].includes(p.status));
  const problems = posts.filter((p) => ['failed', 'canceled'].includes(p.status));

  return (
    <div className="grid gap-10">
      {/* ── Channels ─────────────────────────── */}
      <section className="grid gap-4">
        <h2 className="sec-title">Каналы публикации</h2>

        <div className="grid gap-3">
          {accounts.length === 0 && (
            <p className="font-serif italic text-[14px] text-text-muted">
              Каналы ещё не подключены. Добавьте Telegram-канал или Instagram-аккаунт ниже.
            </p>
          )}
          {accounts.map((a) => (
            <div
              key={a.id}
              className="card flex items-center justify-between gap-4 p-4"
            >
              <div className="flex items-center gap-3">
                <PlatformIcon platform={a.platform} />
                <div>
                  <div className="text-[14px]">{a.displayName}</div>
                  <div className="mono text-[10px] uppercase tracking-[0.18em] text-text-muted">
                    {a.platform}
                    {a.status !== 'active' && (
                      <span className="text-amber-400"> · {a.status === 'expired' ? 'токен истёк' : a.status}</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={() => disconnect(a.id)}
                disabled={busy === a.id}
                className="btn-ghost text-[12px] inline-flex items-center gap-1.5"
              >
                <Trash2 size={13} /> Отключить
              </button>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Telegram connect */}
          <div className="card p-4 grid gap-3">
            <div className="flex items-center gap-2 text-[14px]">
              <Send size={15} /> Telegram-канал
            </div>
            {tgReady ? (
              <>
                <p className="font-serif italic text-[12px] text-text-muted leading-relaxed">
                  Добавьте бота в канал как администратора, затем введите ID канала
                  (<span className="mono">-100…</span>) или <span className="mono">@username</span>.
                </p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="@my_channel или -1001234567890"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                  />
                  <button
                    onClick={connectTelegram}
                    disabled={connecting || !chatId.trim()}
                    className="btn-primary inline-flex items-center gap-1.5"
                  >
                    {connecting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Подключить
                  </button>
                </div>
              </>
            ) : (
              <p className="font-serif italic text-[12px] text-amber-400/80">
                Не настроен TELEGRAM_BOT_TOKEN — подключение Telegram недоступно.
              </p>
            )}
          </div>

          {/* Instagram connect — via PostMyPost */}
          <div className="card p-4 grid gap-3">
            <div className="flex items-center gap-2 text-[14px]">
              <Instagram size={15} /> Instagram
            </div>
            {igReady ? (
              <>
                <p className="font-serif italic text-[12px] text-text-muted leading-relaxed">
                  Публикация идёт через сервис{' '}
                  <a href="https://app.postmypost.io" target="_blank" rel="noreferrer" className="underline">
                    PostMyPost
                  </a>
                  . Подключите свой Instagram в его кабинете, затем выберите аккаунт здесь.
                </p>
                {!igPickerOpen ? (
                  <button
                    onClick={loadIgAccounts}
                    disabled={igLoading}
                    className="btn-primary inline-flex items-center gap-1.5 w-fit"
                  >
                    {igLoading ? <Loader2 size={14} className="animate-spin" /> : <Instagram size={14} />}
                    Выбрать Instagram-аккаунт
                  </button>
                ) : igAccounts.length === 0 ? (
                  <p className="font-serif italic text-[12px] text-amber-400/80">
                    В PostMyPost нет подключённых Instagram-аккаунтов. Подключите аккаунт в{' '}
                    <a href="https://app.postmypost.io" target="_blank" rel="noreferrer" className="underline">
                      кабинете PostMyPost
                    </a>{' '}
                    и повторите.
                  </p>
                ) : (
                  <div className="grid gap-2">
                    {igAccounts.map((acc) => (
                      <button
                        key={`${acc.projectId}:${acc.accountId}`}
                        onClick={() => connectIg(acc)}
                        disabled={connecting}
                        className="border border-border-soft hover:border-gold px-3 py-2 text-left text-[13px] flex items-center justify-between gap-2"
                      >
                        <span>
                          {acc.login ? `@${acc.login}` : acc.name}
                          <span className="text-text-muted text-[11px]"> · {acc.projectName}</span>
                        </span>
                        <Plus size={13} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="font-serif italic text-[12px] text-amber-400/80">
                Не настроен POSTMYPOST_API_TOKEN — подключение Instagram недоступно.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="mono text-[12px] text-red-400 flex items-center gap-1.5">
            <AlertTriangle size={13} /> {error}
          </p>
        )}
      </section>

      {/* ── Queue ────────────────────────────── */}
      <PostGroup title="Запланировано" icon={<Clock size={14} />} posts={upcoming} busy={busy} onPublishNow={publishNow} onCancel={cancel} />
      <PostGroup title="Опубликовано" icon={<CheckCircle2 size={14} />} posts={done} busy={busy} />
      <PostGroup title="Ошибки и отменённые" icon={<AlertTriangle size={14} />} posts={problems} busy={busy} />

      {posts.length === 0 && (
        <div className="card p-8 text-center grid gap-3">
          <p className="font-serif italic text-[15px] text-text-secondary">
            Запланированных постов пока нет.
          </p>
          <Link href="/schedule/new" className="btn-primary w-fit mx-auto inline-flex items-center gap-1.5">
            <Plus size={14} /> Запланировать первый пост
          </Link>
        </div>
      )}
    </div>
  );
}

function PostGroup({
  title,
  icon,
  posts,
  busy,
  onPublishNow,
  onCancel,
}: {
  title: string;
  icon: React.ReactNode;
  posts: Post[];
  busy: string | null;
  onPublishNow?: (id: string) => void;
  onCancel?: (id: string) => void;
}) {
  if (posts.length === 0) return null;
  return (
    <section className="grid gap-4">
      <h2 className="sec-title flex items-center gap-2">
        {icon} {title} <span className="text-text-muted">· {posts.length}</span>
      </h2>
      <div className="grid gap-3">
        {posts.map((p) => (
          <div key={p.id} className="card p-4 flex gap-4">
            <video
              src={p.mediaUrl}
              className="w-[88px] aspect-[9/16] object-cover bg-black/40 rounded-sm shrink-0"
              muted
              playsInline
              preload="metadata"
            />
            <div className="flex-1 min-w-0 grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[13px] text-text-secondary">
                  <Clock size={12} /> {fmtDate(p.scheduledAt)}
                </div>
                <StatusBadge status={p.status} />
              </div>
              {p.caption && (
                <p className="text-[13px] text-text-secondary line-clamp-2 leading-relaxed">
                  {p.caption}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {p.targets.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1.5 border border-border-soft px-2 py-0.5 text-[11px]"
                    title={t.errorMsg ?? undefined}
                  >
                    <PlatformIcon platform={t.platform} />
                    {t.permalink ? (
                      <a href={t.permalink} target="_blank" rel="noreferrer" className="underline">
                        {t.channel}
                      </a>
                    ) : (
                      t.channel
                    )}
                    <StatusBadge status={t.status} />
                  </span>
                ))}
              </div>
              {p.errorMsg && (
                <p className="mono text-[11px] text-red-400/90">{p.errorMsg}</p>
              )}
              {(onPublishNow || onCancel) && (
                <div className="flex gap-2 mt-1">
                  {onPublishNow && (
                    <button
                      onClick={() => onPublishNow(p.id)}
                      disabled={busy === p.id || p.status === 'publishing'}
                      className="btn-primary text-[12px] inline-flex items-center gap-1.5"
                    >
                      <Send size={12} /> Опубликовать сейчас
                    </button>
                  )}
                  {onCancel && (
                    <button
                      onClick={() => onCancel(p.id)}
                      disabled={busy === p.id || p.status === 'publishing'}
                      className="btn-ghost text-[12px] inline-flex items-center gap-1.5"
                    >
                      <Trash2 size={12} /> Отменить
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
