import BottomNav from '@/components/BottomNav'

export default function InstagramIntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <BottomNav />
    </>
  )
}
