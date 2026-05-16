import TranscriptTabs from '@/components/TranscriptTabs'

export default function TranscriptLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { id: string }
}) {
  return (
    <div className="animate-slide-in space-y-4">
      <TranscriptTabs id={params.id} />
      {children}
    </div>
  )
}
