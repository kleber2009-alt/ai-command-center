import type { ReactNode } from 'react'
import { OfficeNav } from '@/components/office/office-nav'

export default function OfficeLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5">
        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500 mb-2">Офис</div>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Операционная система офиса</h1>
            <p className="text-sm text-slate-400 mt-1 max-w-3xl">
              Скелет будущего офиса: решения, память, задачи, события и агентская команда поверх твоих текущих продуктов.
            </p>
          </div>
          <OfficeNav />
        </div>
      </div>
      {children}
    </div>
  )
}
