import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'IG Serial Content — AI Automation',
  description:
    'Serial Instagram content operating system powered by Claude: campaigns, plans, Reels, carousels and analytics.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ru" className="dark">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  )
}
