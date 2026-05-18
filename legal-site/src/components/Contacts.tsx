import { Send, MessageCircle } from "lucide-react";

export default function Contacts() {
  const tg = process.env.NEXT_PUBLIC_TELEGRAM_USERNAME;
  const wa = process.env.NEXT_PUBLIC_WHATSAPP_PHONE;

  const waDisplay = wa ? formatPhone(wa) : "укажите в .env";

  return (
    <section id="contacts" className="py-16 sm:py-24 border-t border-white/10">
      <h2 className="font-serif text-3xl sm:text-4xl text-white">
        Или напишите напрямую
      </h2>
      <p className="mt-3 text-white/60 max-w-xl">
        Если удобнее в мессенджере — ответим в течение часа в рабочее время.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 max-w-2xl">
        <a
          href={tg ? `https://t.me/${tg}` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 rounded-lg border border-white/10 bg-ink-900/60 px-6 py-5 hover:border-accent/60 hover:bg-ink-900 transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
            <Send className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-white/50">Telegram</div>
            <div className="text-lg text-white truncate">
              {tg ? `@${tg}` : "укажите в .env"}
            </div>
          </div>
        </a>

        <a
          href={wa ? `https://wa.me/${wa}` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="group flex items-center gap-4 rounded-lg border border-white/10 bg-ink-900/60 px-6 py-5 hover:border-accent/60 hover:bg-ink-900 transition-colors"
        >
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center flex-shrink-0">
            <MessageCircle className="w-5 h-5 text-accent" />
          </div>
          <div className="min-w-0">
            <div className="text-sm text-white/50">WhatsApp</div>
            <div className="text-lg text-white truncate">{waDisplay}</div>
          </div>
        </a>
      </div>
    </section>
  );
}

function formatPhone(raw: string) {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && (digits.startsWith("7") || digits.startsWith("8"))) {
    return `+7 ${digits.slice(1, 4)} ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`;
  }
  return `+${digits}`;
}
