import AppHeader from '@/components/AppHeader'

export default function MaterialsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      <main className="min-h-screen bg-apple-bg-elev">
        <div className="mx-auto w-full max-w-2xl px-4 pb-24 pt-5 sm:px-6 sm:pt-8 sm:pb-12">
          {children}
        </div>
      </main>
    </>
  )
}
