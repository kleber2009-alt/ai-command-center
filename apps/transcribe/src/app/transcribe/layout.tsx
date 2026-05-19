import BottomNav from '@/components/BottomNav'

export default function TranscribeLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
        {children}
      </div>
      <BottomNav />
    </main>
  )
}
