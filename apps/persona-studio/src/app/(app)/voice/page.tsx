import Link from 'next/link';
import { PageHero } from '@/components/shell/page-hero';
import { VoiceClone } from '@/components/voice/voice-clone';
import { listClonedVoices } from '@/lib/elevenlabs';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Голос — Persona Studio' };

// Нативное клонирование голоса — целиком внутри persona-studio (один проект,
// один домен). Загрузка образца → клон на сервере → голос появляется в списке
// и выбирается в персоне. Без внешних кабинетов и упоминания провайдера.
export default async function VoicePage() {
  const voices = await listClonedVoices().catch(() => []);

  return (
    <div className="grid gap-10">
      <PageHero
        eyebrow="ГОЛОС · 02"
        title={
          <>
            Обучите аватар говорить <span className="italic text-gold">вашим голосом</span>.
          </>
        }
        description={
          <>
            Загрузите короткую запись своего голоса — создадим цифровой голос прямо здесь. Дальше
            выберите его в персоне, и аватар озвучит любой сценарий вашим тембром.
          </>
        }
      />

      <section className="grid gap-3">
        <div className="flex items-baseline gap-3">
          <span className="sec-num">/01</span>
          <span className="sec-title">Клонировать голос</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        <VoiceClone />
        <p className="mono text-[10px] tracking-wider text-text-mute">
          Совет: 30–90 секунд чистой речи без шума и музыки дают лучший результат. Форматы: mp3, m4a,
          wav, ogg.
        </p>
      </section>

      <section className="grid gap-3">
        <div className="flex items-baseline gap-3">
          <span className="sec-num">/02</span>
          <span className="sec-title">Мои голоса</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
        </div>
        {voices.length === 0 ? (
          <p className="mono text-[11px] tracking-widest uppercase text-text-mute">
            Пока нет своих голосов — склонируйте первый выше.
          </p>
        ) : (
          <ul className="border border-border">
            {voices.map((v) => (
              <li
                key={v.voiceId}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 bg-surface"
              >
                <span className="font-serif text-[14px] text-text flex-1 truncate">{v.name}</span>
                <span className="mono text-[9px] tracking-widest uppercase text-lime">готов</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mono text-[10px] tracking-wider text-text-mute">
          Выберите голос в{' '}
          <Link href="/personas" className="text-gold hover:underline">
            персоне
          </Link>{' '}
          — он подставится в генерацию видео.
        </p>
      </section>
    </div>
  );
}
