import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold text-apple-ink">Страница не найдена</h1>
      <p className="text-apple-muted">Запрошенная страница не существует.</p>
      <Link
        href="/transcribe"
        className="rounded-full bg-apple-blue px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-apple-blue-hover"
      >
        К транскрибации
      </Link>
    </div>
  )
}
