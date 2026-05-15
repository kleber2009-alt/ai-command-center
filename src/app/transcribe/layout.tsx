export default function TranscribeLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950">
      <div className="mx-auto w-full max-w-2xl px-3 pb-24 pt-4 sm:px-5 sm:pt-6 sm:pb-10">
        {children}
      </div>
    </main>
  )
}
