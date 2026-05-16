import HistoryList from '@/components/HistoryList'

export default function HistoryPage() {
  return (
    <div className="animate-slide-in space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-100">История</h1>
        <p className="text-sm text-slate-500 mt-0.5">Все сохранённые транскрипты и сгенерированный контент</p>
      </div>
      <HistoryList limit={50} />
    </div>
  )
}
