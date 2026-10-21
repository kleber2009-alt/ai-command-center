'use client';

import { useState, useTransition } from 'react';
import { errorText } from '@/lib/error-text';
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
import { Icon3D } from '@/components/ui/icon3d';

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
    // Fixed timezone → server and client render the same string (no #418 hydration mismatch).
    timeZone: 'Europe/Moscow',
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
      ? 'status-ready'
      : status === 'failed'
        ? 'status-failed'
        : status === 'partial'
          ? 'status-partial'
          : status === 'publishing'
            ? 'status-processing'
            : status === 'scheduled'
              ? 'status-scheduled'
              : 'text-text-mute';
  return (
    <span className={`status-badge ${color}`}>
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
  tgBotUsername,
}: {
  initialPosts: Post[];
  initialAccounts: Account[];
  igReady: boolean;
  tgReady: boolean;
  tgBotUsername: string | null;
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
    if (!window.confirm('Отключить канал? Запланированные публикации в него не уйдут.')) return;
    setBusy(id);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/schedule/accounts/${id}`, { method: 'DELETE' });
      setBusy(null);
      if (res.ok) setAccounts((a) => a.filter((x) => x.id !== id));
      else setError(errorText(await res.json().catch(() => null), res.status));
    });
  }

  function publishNow(id: string) {
    setBusy(id);
    startTransition(async () => {
      const res = await fetch(`/api/schedule/posts/${id}/publish-now`, { method: 'POST' });
      setBusy(null);
      if (res.ok) {
        setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, status: 'publishing' } : p)));
      } else {
        setError(errorText(await res.json().catch(() => null), res.status));
      }
    });
  }

  function cancel(id: string) {
    if (!window.confirm('Отменить публикацию?')) return;
    setBusy(id);
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/schedule/posts/${id}`, { method: 'DELETE' });
      setBusy(null);
      if (res.ok) {
        setPosts((ps) => ps.map((p) => (p.id === id ? { ...p, status: 'canceled' } : p)));
      } else {
        setError(errorText(await res.json().catch(() => null), res.status));
      }
    });
  }

  const upcoming = posts.filter((p) => ['scheduled', 'publishing', 'draft'].includes(p.status));
  const done = posts.filter((p) => ['published', 'partial'].includes(p.status));
  const problems = posts.filter((p) => ['failed', 'canceled'].includes(p.status));

  return (
    <div className="grid gap-8">
      {/* ── New post CTA (always reachable, not only on empty queue) ── */}
      <div className="flex justify-end">
        <Link href="/schedule/new" className="btn-primary w-fit">
          <Plus size={16} /> Запланировать пост
        </Link>
      </div>

      {/* ── Channels ─────────────────────────── */}
      <section className="grid gap-4 reveal">
        <h2 className="flex items-center gap-3"><span className="sec-num">/01</span><span className="sec-title">Каналы публикации</span></h2>

        <div className="grid gap-3 stagger">
          {accounts.length === 0 && (
            <p className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] px-5 py-6 text-center text-[14px] text-text-mute">
              Каналы ещё не подключены. Добавьте Telegram-канал или Instagram-аккаунт ниже.
            </p>
          )}
          {accounts.map((a) => (
            <div
              key={a.id}
              className="panel flex items-center justify-between gap-4 p-4"
            >
              <div className="flex items-center gap-3">
                <span className="inline-flex h-10 w-10 flex-none items-center justify-center rounded-full bg-white/[0.06] text-text-dim">
                  <PlatformIcon platform={a.platform} />
                </span>
                <div>
                  <div className="text-[14px] font-semibold text-text">{a.displayName}</div>
                  <div className="text-[12px] text-text-mute">
                    {a.platform}
                    {a.status !== 'active' && (
                      <span className="text-amber"> · {a.status === 'expired' ? 'токен истёк' : a.status}</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => disconnect(a.id)}
                disabled={busy === a.id}
                className="btn-ghost !px-4 !py-2 !text-[13px] hover:!text-pink hover:!border-pink/40"
              >
                <Trash2 size={14} /> Отключить
              </button>
            </div>
          ))}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          {/* Telegram connect */}
          <div className="panel p-5 grid gap-3 content-start">
            <div className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] text-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-cyan/15 text-cyan"><Send size={15} /></span> Telegram-канал
            </div>
            {tgReady ? (
              <>
                <p className="text-[13px] text-text-dim leading-relaxed">
                  Добавьте бота{' '}
                  {tgBotUsername ? (
                    <a
                      href={`https://t.me/${tgBotUsername}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-gold underline underline-offset-2"
                    >
                      @{tgBotUsername}
                    </a>
                  ) : (
                    'нашего бота'
                  )}{' '}
                  в канал как администратора (с правом «Публикация сообщений»), затем
                  введите ID канала (<span className="font-mono text-[12px] text-text">-100…</span>) или{' '}
                  <span className="font-mono text-[12px] text-text">@username</span>.
                </p>
                <div className="flex gap-2">
                  <input
                    className="input flex-1"
                    placeholder="@my_channel или -1001234567890"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={connectTelegram}
                    disabled={connecting || !chatId.trim()}
                    className="btn-primary"
                  >
                    {connecting ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                    Подключить
                  </button>
                </div>
              </>
            ) : (
              <p className="rounded-2xl border border-amber/25 bg-amber/[0.06] px-3.5 py-2.5 text-[13px] text-amber">
                Не настроен TELEGRAM_BOT_TOKEN — подключение Telegram недоступно.
              </p>
            )}
          </div>

          {/* Instagram connect — via PostMyPost */}
          <div className="panel p-5 grid gap-3 content-start">
            <div className="flex items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] text-text">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-pink/15 text-pink"><Instagram size={15} /></span> Instagram
            </div>
            {igReady ? (
              <>
                <p className="text-[13px] text-text-dim leading-relaxed">
                  Публикация идёт через сервис{' '}
                  <a href="https://app.postmypost.io" target="_blank" rel="noreferrer" className="underline">
                    PostMyPost
                  </a>
                  . Подключите свой Instagram в его кабинете, затем выберите аккаунт здесь.
                </p>
                {!igPickerOpen ? (
                  <button
                    type="button"
                    onClick={loadIgAccounts}
                    disabled={igLoading}
                    className="btn-primary w-fit"
                  >
                    {igLoading ? <Loader2 size={14} className="animate-spin" /> : <Instagram size={14} />}
                    Выбрать Instagram-аккаунт
                  </button>
                ) : igAccounts.length === 0 ? (
                  <p className="rounded-2xl border border-amber/25 bg-amber/[0.06] px-3.5 py-2.5 text-[13px] text-amber">
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
                        type="button"
                        className="rounded-2xl border border-border-soft bg-white/[0.04] hover:border-gold/50 hover:bg-blue/[0.06] px-3.5 py-2.5 text-left text-[13px] text-text flex items-center justify-between gap-2 transition-colors"
                      >
                        <span>
                          {acc.login ? `@${acc.login}` : acc.name}
                          <span className="text-text-mute text-[12px]"> · {acc.projectName}</span>
                        </span>
                        <Plus size={13} />
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="rounded-2xl border border-amber/25 bg-amber/[0.06] px-3.5 py-2.5 text-[13px] text-amber">
                Не настроен POSTMYPOST_API_TOKEN — подключение Instagram недоступно.
              </p>
            )}
          </div>
        </div>

        {error && (
          <p className="rounded-2xl border border-danger/40 bg-danger/[0.08] px-3.5 py-2.5 text-[13px] text-danger flex items-center gap-2">
            <AlertTriangle size={13} /> {error}
          </p>
        )}
      </section>

      {/* ── Queue ────────────────────────────── */}
      <PostGroup title="Запланировано" icon={<Clock size={14} />} posts={upcoming} busy={busy} onPublishNow={publishNow} onCancel={cancel} />
      <PostGroup title="Опубликовано" icon={<CheckCircle2 size={14} />} posts={done} busy={busy} />
      <PostGroup title="Ошибки и отменённые" icon={<AlertTriangle size={14} />} posts={problems} busy={busy} />

      {posts.length === 0 && (
        <div className="rounded-[24px] border border-dashed border-white/15 bg-white/[0.03] p-10 flex flex-col items-center text-center gap-3 fade-in">
          <Icon3D name="schedule" size={44} tile sway />
          <p className="text-[16px] font-semibold tracking-[-0.02em] text-text">
            Запланированных постов пока нет.
          </p>
          <Link href="/schedule/new" className="btn-primary w-fit">
            <Plus size={16} /> Запланировать первый пост
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
    <section className="grid gap-4 reveal">
      <h2 className="sec-title flex items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue/15 text-gold">{icon}</span>
        {title} <span className="tabular-nums text-text-mute">· {posts.length}</span>
      </h2>
      <div className="grid gap-3 stagger">
        {posts.map((p) => (
          <div key={p.id} className="panel p-4 flex gap-4">
            <video
              src={p.mediaUrl}
              className="w-[88px] aspect-[9/16] object-cover bg-black/40 rounded-2xl shrink-0"
              muted
              playsInline
              preload="metadata"
            />
            <div className="flex-1 min-w-0 grid gap-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[13px] tabular-nums text-text-dim">
                  <Clock size={12} /> {fmtDate(p.scheduledAt)}
                </div>
                <StatusBadge status={p.status} />
              </div>
              {p.caption && (
                <p className="text-[13.5px] text-text-dim line-clamp-2 leading-relaxed">
                  {p.caption}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {p.targets.map((t) => (
                  <span
                    key={t.id}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border-soft bg-white/[0.04] py-0.5 pl-2.5 pr-1 text-[12px] text-text-dim"
                    title={t.errorMsg ?? undefined}
                  >
                    <PlatformIcon platform={t.platform} />
                    {t.permalink ? (
                      <a href={t.permalink} target="_blank" rel="noreferrer" className="text-gold underline underline-offset-2">
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
                <p className="text-[12.5px] text-danger">{p.errorMsg}</p>
              )}
              {(onPublishNow || onCancel) && (
                <div className="flex gap-2 mt-1">
                  {onPublishNow && (
                    <button
                      type="button"
                      onClick={() => onPublishNow(p.id)}
                      disabled={busy === p.id || p.status === 'publishing'}
                      className="btn-primary !px-4 !py-2 !text-[13px]"
                    >
                      <Send size={14} /> Опубликовать сейчас
                    </button>
                  )}
                  {onCancel && (
                    <button
                      type="button"
                      onClick={() => onCancel(p.id)}
                      disabled={busy === p.id}
                      className="btn-ghost !px-4 !py-2 !text-[13px]"
                    >
                      <Trash2 size={14} /> Отменить
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
