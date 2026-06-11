import Link from 'next/link';
import { PageHero } from '@/components/shell/page-hero';

export const metadata = { title: 'Помощь — Persona Studio' };

const STEPS = [
  {
    n: '01',
    title: 'Загрузи селфи',
    body: 'На странице «Avatar» загрузи одно чёткое фото лица. Выбери стиль или нишу — движок соберёт батч из 10 аватаров.',
    href: '/generate',
    cta: 'Создать аватары',
  },
  {
    n: '02',
    title: 'Выбери лучший',
    body: 'В библиотеке аватаров открой батч и отметь главный — он станет основой для видео и обложек.',
    href: '/avatars',
    cta: 'Мои аватары',
  },
  {
    n: '03',
    title: 'Говорящее видео',
    body: 'Выбери аватара, вставь сценарий и голос — получишь talking-photo видео. Токены за неудачу возвращаются.',
    href: '/videos/new',
    cta: 'Сделать видео',
  },
  {
    n: '04',
    title: 'Обложки и карусели',
    body: 'Виральная обложка за один промпт или редакторская карусель из слайдов под твою нишу.',
    href: '/covers/new',
    cta: 'Сделать обложку',
  },
  {
    n: '05',
    title: 'Найди тренды',
    body: 'Research ищет залетевшие рилсы в твоей нише, парсер следит за конкурентами и предлагает готовые идеи.',
    href: '/research',
    cta: 'Открыть Research',
  },
  {
    n: '06',
    title: 'Запланируй постинг',
    body: 'Поставь публикацию в Instagram и Telegram на нужное время — контент выйдет сам.',
    href: '/schedule',
    cta: 'Расписание',
  },
];

const FAQ = [
  {
    q: 'Откуда берутся токены?',
    a: 'После первого входа начисляется приветственный бонус. Пополнить баланс можно в разделе «Subscription» через CryptoBot (USDT) или Telegram Stars.',
  },
  {
    q: 'Что если генерация не удалась?',
    a: 'Токены за неуспешную задачу возвращаются автоматически. Неудачные видео и обложки можно перезапустить кнопкой «Повтор».',
  },
  {
    q: 'Как подключить свой голос?',
    a: 'Через Persona Train (раздел «Voice»): шлёшь голосовые в Telegram-бота, получаешь voice_id и вставляешь его в форму создания видео.',
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
        eyebrow="HELP · DOCS · 00"
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
        actions={[
          { label: 'Начать с аватара', href: '/generate' },
          { label: 'Поддержка в Telegram', href: 'https://t.me/ilia_pali0', tone: 'ghost' },
        ]}
      />

      <section className="grid gap-4">
        <h2 className="sec-title">Быстрый старт</h2>
        <div className="grid sm:grid-cols-2 gap-3">
          {STEPS.map((s) => (
            <Link
              key={s.n}
              href={s.href}
              className="border border-border bg-surface p-5 hover:border-gold/40 transition-colors grid gap-2"
            >
              <span className="mono text-[10px] tracking-widest text-gold">/ {s.n}</span>
              <span className="font-serif text-[18px]">{s.title}</span>
              <span className="font-serif text-[14px] text-text-dim">{s.body}</span>
              <span className="mono text-[10px] tracking-widest uppercase text-text-mute mt-1">
                {s.cta} →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="sec-title">Частые вопросы</h2>
        <div className="grid gap-3">
          {FAQ.map((f) => (
            <div key={f.q} className="border border-border bg-surface p-5 grid gap-1.5">
              <span className="font-serif text-[16px] text-gold">{f.q}</span>
              <span className="font-serif text-[14px] text-text-dim">{f.a}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="border border-border bg-surface p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <span className="font-serif text-[18px]">Нужна помощь?</span>
          <span className="font-serif text-[14px] text-text-dim">
            Напиши в Telegram — отвечаем по подключению, токенам и генерации.
          </span>
        </div>
        <a
          href="https://t.me/ilia_pali0"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          Telegram @ilia_pali0
        </a>
      </section>
    </div>
  );
}
