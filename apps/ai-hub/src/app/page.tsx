import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="max-w-2xl text-center">
        <h1 className="text-5xl font-semibold tracking-tight">AI Creative Hub</h1>
        <p className="mt-6 text-lg text-muted">
          Единый кабинет для создания контента. Image · Video · Voice — все нейросети
          через единый баланс токенов, без 20 подписок.
        </p>
        <div className="mt-10 flex gap-3 justify-center">
          <Link href="/dashboard" className="btn">Войти в кабинет</Link>
          <Link href="/login" className="btn-ghost">Регистрация</Link>
        </div>
      </div>
    </main>
  );
}
