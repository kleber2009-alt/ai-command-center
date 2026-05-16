import { Send, MessageCircle } from "lucide-react";

export default function Contacts() {
  const tg = process.env.NEXT_PUBLIC_TELEGRAM_USERNAME;
  const wa = process.env.NEXT_PUBLIC_WHATSAPP_PHONE;

  return (
    <aside className="rounded-lg border border-white/10 bg-ink-900/40 p-6 h-fit">
      <h3 className="font-serif text-lg text-white">Связаться напрямую</h3>
      <p className="mt-1 text-sm text-white/60">
        Если удобнее в мессенджере — напишите нам:
      </p>
      <div className="mt-5 space-y-3">
        <a
          href={tg ? `https://t.me/${tg}` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md border border-white/10 bg-ink-900 px-4 py-3 hover:border-accent/50 transition-colors group"
        >
          <Send className="w-5 h-5 text-accent" />
          <div className="min-w-0">
            <div className="text-sm text-white/50">Telegram</div>
            <div className="text-white truncate">{tg ? `@${tg}` : "укажите в .env"}</div>
          </div>
        </a>
        <a
          href={wa ? `https://wa.me/${wa}` : "#"}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-md border border-white/10 bg-ink-900 px-4 py-3 hover:border-accent/50 transition-colors group"
        >
          <MessageCircle className="w-5 h-5 text-accent" />
          <div className="min-w-0">
            <div className="text-sm text-white/50">WhatsApp</div>
            <div className="text-white truncate">
              {wa ? `+${wa}` : "укажите в .env"}
            </div>
          </div>
        </a>
      </div>
    </aside>
  );
}
