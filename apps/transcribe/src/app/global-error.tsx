'use client'

// App Router global error boundary — wraps <html>/<body> so Next.js
// won't fall back to its Pages-Router-flavoured 500 page.
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-white">
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
          <h1 className="text-2xl font-semibold">Что-то пошло не так</h1>
          <p>Произошла непредвиденная ошибка.</p>
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-full bg-blue-600 px-5 py-2.5 text-sm font-medium text-white"
          >
            Повторить
          </button>
        </div>
      </body>
    </html>
  )
}
