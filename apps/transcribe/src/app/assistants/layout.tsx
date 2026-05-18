export default function AssistantsLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-16 sm:px-6 sm:pb-12 sm:pt-16">
        {children}
      </div>
    </main>
  )
}
