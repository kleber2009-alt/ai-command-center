// «Мои ветки» — branches grouped by where they are: in progress, ready,
// planned / published, with errors on top so nothing gets stuck unseen.

import Link from 'next/link';
import { AlertTriangle, ArrowRight, Film, Images } from 'lucide-react';
import { Icon3D } from '@/components/ui/icon3d';
import { CoverImg } from './cover-img';
import { STAGE_LABEL, type PipelineStage, type PipelineView } from '@/lib/pipeline/types';

const GROUPS: { key: string; title: string; stages: PipelineStage[] }[] = [
  { key: 'error', title: 'Нужно внимание', stages: ['error'] },
  { key: 'work', title: 'В работе', stages: ['source', 'script', 'video', 'montage'] },
  { key: 'ready', title: 'Готово к публикации', stages: ['ready'] },
  { key: 'out', title: 'Запланировано и опубликовано', stages: ['scheduled', 'published'] },
];

const BADGE: Record<PipelineStage, string> = {
  source: 'status-queued',
  script: 'status-queued',
  video: 'status-processing',
  montage: 'status-processing',
  ready: 'status-ready',
  scheduled: 'status-scheduled',
  published: 'status-ready',
  error: 'status-failed',
};

function cover(p: PipelineView): string | null {
  return p.heygenAvatarImage || p.source?.thumbnailUrl || p.source?.slideImages[0] || null;
}

function Card({ p }: { p: PipelineView }) {
  const img = cover(p);
  const KindIcon = p.kind === 'carousel' ? Images : Film;
  return (
    <Link href={`/pipeline/${p.id}`} className="card-editorial group flex gap-4 overflow-hidden !rounded-2xl p-3">
      <div className="relative aspect-[3/4] w-20 shrink-0 overflow-hidden rounded-xl bg-white/[0.04]">
        <span className="absolute inset-0 grid place-items-center text-text-mute">
          <KindIcon size={20} />
        </span>
        {img && <CoverImg src={img} className="relative h-full w-full object-cover" />}
      </div>
      <div className="grid min-w-0 flex-1 content-start gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`status-badge ${BADGE[p.stage]}`}>{STAGE_LABEL[p.stage]}</span>
          <span className="flex items-center gap-1 text-[11px] text-text-mute">
            <KindIcon size={11} /> {p.kind === 'carousel' ? 'карусель' : 'рилс'}
          </span>
        </div>
        <span className="line-clamp-2 text-[14px] font-medium leading-snug text-text">{p.title || (p.kind === 'carousel' ? 'Карусель' : 'Рилс')}</span>
        {p.stage === 'error' && p.errorMsg ? (
          <span className="flex items-start gap-1.5 text-[12px] text-danger">
            <AlertTriangle size={12} className="mt-0.5 shrink-0" /> <span className="line-clamp-2">{p.errorMsg}</span>
          </span>
        ) : (
          <span className="truncate text-[12px] text-text-mute">
            {[p.heygenAvatarName, p.voiceName, new Date(p.updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })].filter(Boolean).join(' · ')}
          </span>
        )}
      </div>
      <ArrowRight size={16} className="mt-1 shrink-0 text-text-mute transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

export function PipelineList({ pipelines }: { pipelines: PipelineView[] }) {
  if (pipelines.length === 0) {
    return (
      <section className="panel grid justify-items-center gap-4 p-10 text-center">
        <Icon3D name="sparkles" size={48} tile />
        <p className="max-w-md text-[14px] text-text-dim">
          Пока нет веток. Откройте «Мой блог», выберите пост, который хорошо зашёл, и нажмите «Уникализировать».
        </p>
        <Link href="/blog" className="btn-primary">
          В «Мой блог»
        </Link>
      </section>
    );
  }
  return (
    <div className="grid gap-8">
      {GROUPS.map((g) => {
        const list = pipelines.filter((p) => g.stages.includes(p.stage));
        if (list.length === 0) return null;
        return (
          <section key={g.key} className="grid gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-[15px] font-medium text-text">{g.title}</h2>
              <span className="sec-num">{list.length}</span>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {list.map((p) => (
                <Card key={p.id} p={p} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
