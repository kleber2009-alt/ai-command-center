import Link from 'next/link';
import { ArrowRight, Send } from 'lucide-react';
import { PageHero } from '@/components/shell/page-hero';
import { Icon3D, type Icon3DName } from '@/components/ui/icon3d';

export const metadata = { title: 'Помощь — Persona Studio' };

const STEPS = [
  {
    n: '01',
    icon: 'avatar' as Icon3DName,
    title: 'Загрузи селфи',
    body: 'На странице «Аватар» загрузи одно чёткое фото лица. Выбери стиль или нишу — движок соберёт батч из 10 аватаров.',
    href: '/generate',
    cta: 'Создать аватары',
  },
  {
    n: '02',
    icon: 'done' as Icon3DName,
    title: 'Выбери лучший',
    body: 'В библиотеке аватаров открой батч и отметь главный — он станет основой для видео и обложек.',
    href: '/avatars',
    cta: 'Мои аватары',
  },
  {
    n: '03',
    icon: 'video' as Icon3DName,
    title: 'Говорящее видео',
    body: 'Выбери аватара, вставь сценарий и голос — получишь видео с говорящим фото. Токены за неудачу возвращаются.',
    href: '/videos/new',
    cta: 'Сделать видео',
  },
  {
    n: '04',
    icon: 'covers' as Icon3DName,
    title: 'Обложки и карусели',
    body: 'Виральная обложка за один промпт или редакторская карусель из слайдов под твою нишу.',
    href: '/covers/new',
    cta: 'Сделать обложку',
  },
  {
    n: '05',
    icon: 'research' as Icon3DName,
    title: 'Найди тренды',
    body: 'Ресёрч ищет залетевшие рилсы в твоей нише, парсер следит за конкурентами и предлагает готовые идеи.',
    href: '/research',
    cta: 'Открыть ресёрч',
  },
  {
    n: '06',
    icon: 'schedule' as Icon3DName,
    title: 'Запланируй постинг',
    body: 'Поставь публикацию в Instagram и Telegram на нужное время — контент выйдет сам.',
    href: '/schedule',
    cta: 'Расписание',
  },
];

const FAQ = [
  {
    q: 'Откуда берутся токены?',
    a: 'После первого входа начисляется приветственный бонус. Пополнить баланс можно в разделе «Подписка» через CryptoBot (USDT) или Telegram Stars.',
  },
  {
    q: 'Что если генерация не удалась?',
    a: 'Токены за неуспешную задачу возвращаются автоматически. Неудачные видео и обложки можно перезапустить кнопкой «Повтор».',
  },
  {
    q: 'Как подключить свой голос?',
    a: 'В разделе «Голос»: шлёшь голосовые в Telegram-бота, получаешь ID голоса и вставляешь его в форму создания видео (или выбираешь готовый голос в персоне).',
  },
  {
    q: 'Безопасно ли загружать фото?',
    a: 'Каждое фото проходит модерацию (одно человеческое лицо, без NSFW). Обрабатываем только изображение лица — для генерации аватаров.',
  },
];

export default function HelpPage() {
  return (
    <div className="grid gap-12">
      <PageHero
        eyebrow="ПОМОЩЬ · ДОКИ · 00"
        title={
          <>
            Как работает <span className="italic text-gold">студия</span>.
          </>
        }
        description={
          <>
            Короткий путь от одного селфи до готового контента: аватары, говорящие видео, обложки,
            карусели и автопостинг. Ниже — шаги, частые вопросы и поддержка.
          </>
        }
        icon="help"
        actions={[
          { label: 'Начать с аватара', href: '/generate' },
          { label: 'Поддержка в Telegram', href: 'https://t.me/ilia_pali0', tone: 'ghost' },
        ]}
      />

      <section className="grid gap-4">
        <div className="flex items-center gap-3">
          <span className="sec-num">/01</span>
          <h2 className="sec-title">Быстрый старт</h2>
          <span className="flex-1 border-b border-border-soft" />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 stagger">
          {STEPS.map((s) => (
            <Link
              key={s.n}
              href={s.href}
              className="card-editorial group p-5 flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <Icon3D name={s.icon} size={28} tile />
                <span className="sec-num">/{s.n}</span>
              </div>
              <span className="text-[18px] font-semibold tracking-[-0.02em] text-text">{s.title}</span>
              <span className="text-[14px] leading-[1.55] text-text-dim flex-1">{s.body}</span>
              <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-gold mt-1">
                {s.cta}
                <ArrowRight size={14} strokeWidth={2.2} className="transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <div className="flex items-center gap-3">
          <span className="sec-num">/02</span>
          <h2 className="sec-title">Частые вопросы</h2>
          <span className="flex-1 border-b border-border-soft" />
        </div>
        <div className="grid md:grid-cols-2 gap-3 stagger">
          {FAQ.map((f) => (
            <div key={f.q} className="panel p-5 grid gap-2 content-start">
              <span className="text-[16px] font-semibold tracking-[-0.01em] text-text">{f.q}</span>
              <span className="text-[14px] leading-[1.55] text-text-dim">{f.a}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="panel p-6 flex flex-wrap items-center justify-between gap-4 reveal">
        <div className="flex items-center gap-4">
          <Icon3D name="help" size={32} tile sway />
          <div className="grid gap-1">
            <span className="text-[18px] font-semibold tracking-[-0.02em] text-text">Нужна помощь?</span>
            <span className="text-[14px] text-text-dim">
              Напиши в Telegram — отвечаем по подключению, токенам и генерации.
            </span>
          </div>
        </div>
        <a
          href="https://t.me/ilia_pali0"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          <Send size={15} strokeWidth={2.2} aria-hidden="true" />
          Telegram @ilia_pali0
        </a>
      </section>
    </div>
  );
}
