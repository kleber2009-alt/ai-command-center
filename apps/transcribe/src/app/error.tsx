'use client'

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-apple-ink">Что-то пошло не так</h1>
      <p className="text-apple-muted">Произошла ошибка. Попробуй ещё раз.</p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-full bg-apple-blue px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-apple-blue-hover"
      >
        Повторить
      </button>
    </div>
  )
}
