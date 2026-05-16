'use client'
import { Loader2 } from 'lucide-react'

export default function GenerateButton({
  loading,
  onClick,
  children,
  Icon,
  className,
}: {
  loading: boolean
  onClick: () => void
  children: React.ReactNode
  Icon: any
  className: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Icon className="w-4 h-4" />}
      {children}
    </button>
  )
}
