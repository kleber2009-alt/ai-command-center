'use client'

import { Mail, Phone, MapPin } from 'lucide-react'

export default function Contact() {
  return (
    <section id="contact" className="bg-ink-900 text-ink-50">
      <div className="mx-auto grid max-w-6xl gap-16 px-6 py-24 sm:py-32 lg:grid-cols-2">
        <div>
          <div className="mb-6 flex items-center gap-3 text-xs uppercase tracking-[0.25em] text-gold-400">
            <span className="h-px w-10 bg-gold-500" />
            Контакты
          </div>
          <h2 className="font-serif text-4xl font-medium leading-tight sm:text-5xl">
            Расскажите о вашей
            <br />
            ситуации
          </h2>
          <p className="mt-6 max-w-md text-lg leading-relaxed text-ink-50/70">
            Первая консультация — бесплатно. Ответим в течение часа в рабочее время
            и предложим варианты дальнейших шагов.
          </p>

          <div className="mt-12 space-y-5 text-sm">
            <ContactLine
              icon={<Phone className="h-4 w-4 text-gold-400" />}
              label="Телефон"
              value="+7 (495) 123-45-67"
              href="tel:+74951234567"
            />
            <ContactLine
              icon={<Mail className="h-4 w-4 text-gold-400" />}
              label="E-mail"
              value="hello@lex-partners.ru"
              href="mailto:hello@lex-partners.ru"
            />
            <ContactLine
              icon={<MapPin className="h-4 w-4 text-gold-400" />}
              label="Офис"
              value="Москва, Пресненская наб., 12"
            />
          </div>
        </div>

        <form
          className="rounded-sm border border-ink-50/10 bg-ink-950/40 p-8 backdrop-blur"
          onSubmit={(e) => e.preventDefault()}
        >
          <div className="space-y-5">
            <Field label="Ваше имя" name="name" placeholder="Иван Петров" />
            <Field label="Телефон" name="phone" type="tel" placeholder="+7 ___ ___ __ __" />
            <Field label="E-mail" name="email" type="email" placeholder="you@example.com" />
            <div>
              <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink-50/55">
                Кратко о ситуации
              </label>
              <textarea
                name="message"
                rows={4}
                className="w-full rounded-sm border border-ink-50/15 bg-transparent px-4 py-3 text-sm text-ink-50 placeholder:text-ink-50/30 focus:border-gold-400 focus:outline-none"
                placeholder="Опишите вопрос в нескольких предложениях"
              />
            </div>
          </div>

          <button
            type="submit"
            className="mt-8 w-full rounded-sm bg-gold-500 px-6 py-4 text-sm font-medium text-ink-900 transition-colors hover:bg-gold-400"
          >
            Отправить заявку
          </button>
          <p className="mt-4 text-center text-xs text-ink-50/40">
            Отправляя форму, вы соглашаетесь с политикой обработки персональных данных
          </p>
        </form>
      </div>
    </section>
  )
}

function ContactLine({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode
  label: string
  value: string
  href?: string
}) {
  const Wrapper: React.ElementType = href ? 'a' : 'div'
  return (
    <Wrapper
      href={href}
      className="flex items-center gap-4 border-b border-ink-50/10 pb-5 last:border-0 hover:text-gold-400"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-sm border border-ink-50/10">
        {icon}
      </span>
      <span className="flex flex-col">
        <span className="text-xs uppercase tracking-[0.18em] text-ink-50/45">{label}</span>
        <span className="mt-0.5 text-base">{value}</span>
      </span>
    </Wrapper>
  )
}

function Field({
  label,
  name,
  type = 'text',
  placeholder,
}: {
  label: string
  name: string
  type?: string
  placeholder?: string
}) {
  return (
    <div>
      <label className="mb-2 block text-xs uppercase tracking-[0.18em] text-ink-50/55">
        {label}
      </label>
      <input
        type={type}
        name={name}
        placeholder={placeholder}
        className="w-full rounded-sm border border-ink-50/15 bg-transparent px-4 py-3 text-sm text-ink-50 placeholder:text-ink-50/30 focus:border-gold-400 focus:outline-none"
      />
    </div>
  )
}
