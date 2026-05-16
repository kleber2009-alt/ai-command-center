'use client'
import { Copy, Send } from 'lucide-react'
import type { TgPostContent } from '@/lib/types'

export default function TgPostView({ post }: { post: TgPostContent }) {
  return (
    <div className="bg-sky-500/5 border border-sky-500/20 rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-sky-500/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Send className="w-4 h-4 text-sky-400" />
          <h3 className="text-xs font-semibold text-sky-300 uppercase tracking-wider">
            Пост в Telegram · {post.text.length} символов
          </h3>
        </div>
        <button
          onClick={() => navigator.clipboard.writeText(post.text)}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] text-slate-400 border border-slate-700/50 hover:border-slate-600 hover:text-slate-200 transition-all"
        >
          <Copy className="w-3 h-3" /> Копировать
        </button>
      </div>
      <div className="p-5 max-h-[60vh] overflow-y-auto">
        <p className="text-sm text-slate-200 leading-relaxed whitespace-pre-wrap">{post.text}</p>
      </div>
    </div>
  )
}
