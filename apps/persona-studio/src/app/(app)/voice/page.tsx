import Link from 'next/link';
import { Icon3D } from '@/components/ui/icon3d';
import { PageHero } from '@/components/shell/page-hero';
import { VoiceClone } from '@/components/voice/voice-clone';
import { getCurrentUser } from '@/lib/auth';
import { listOwnedVoices } from '@/lib/voice/owned';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Голос — Persona Studio' };

// Нативное клонирование голоса — целиком внутри persona-studio (один проект,
// один домен). Загрузка образца → клон на сервере → голос появляется в списке
// и выбирается в персоне. Без внешних кабинетов и упоминания провайдера.
export default async function VoicePage() {
  const user = await getCurrentUser();
  const voices = user ? await listOwnedVoices(user.id).catch(() => []) : [];

  return (
    <div className="grid gap-10">
      <PageHero
        eyebrow="ГОЛОС · 02"
        title={
          <>
            Обучите аватар говорить <span className="italic">вашим голосом</span>.
          </>
        }
        description={
          <>
            Загрузите короткую запись своего голоса — создадим цифровой голос прямо здесь. Дальше
            выберите его в персоне, и аватар озвучит любой сценарий вашим тембром.
          </>
        }
        icon="voice"
      />

      <section className="reveal grid gap-4">
        <div className="flex items-center gap-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Клонировать голос</span>
          <span className="h-px flex-1 bg-border-soft" />
        </div>
        <VoiceClone />
        <p className="text-[12px] text-text-mute">
          Совет: 30–90 секунд чистой речи без шума и музыки дают лучший результат. Форматы: mp3, m4a,
          wav, ogg.
        </p>
      </section>

      <section className="reveal grid gap-4" style={{ ['--i' as string]: 1 } as React.CSSProperties}>
        <div className="flex items-center gap-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">Мои голоса</span>
          <span className="h-px flex-1 bg-border-soft" />
          {voices.length > 0 && <span className="text-[12px] text-text-mute tabular-nums">{voices.length}</span>}
        </div>
        {voices.length === 0 ? (
          <div className="panel flex items-center gap-4 p-5">
            <Icon3D name="voice" size={26} tile />
            <p className="text-[14px] text-text-dim">Пока нет своих голосов — склонируйте первый выше.</p>
          </div>
        ) : (
          <ul className="stagger grid gap-2.5 sm:grid-cols-2">
            {voices.map((v) => (
              <li key={v.voiceId} className="panel flex items-center gap-3 px-4 py-3.5">
                <Icon3D name="voice" size={20} tile />
                <span className="flex-1 truncate text-[15px] font-medium text-text">{v.name}</span>
                <span className="status-badge status-ready">готов</span>
              </li>
            ))}
          </ul>
        )}
        <p className="text-[12px] text-text-mute">
          Выберите голос в{' '}
          <Link href="/personas" className="font-medium text-gold hover:underline">
            персоне
          </Link>{' '}
          — он подставится в генерацию видео.
        </p>
      </section>
    </div>
  );
}
