"use client";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const params = useSearchParams();
  const checkEmail = params.get("check") === "email";
  const callbackUrl = params.get("callbackUrl") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(null);
    const res = await signIn("email", { email, redirect: false, callbackUrl });
    setLoading(false);
    if (res?.error) setError(res.error);
    else if (res?.ok || res?.url) {
      const u = new URL(window.location.href);
      u.searchParams.set("check", "email");
      window.history.replaceState(null, "", u.toString());
      location.reload();
    }
  }

  return (
    <main className="min-h-screen grid place-items-center px-6">
      <div className="panel p-8 w-full max-w-md">
        <h1 className="text-2xl font-semibold">Вход в AI Creative Hub</h1>
        <p className="text-muted mt-2">Введите email — пришлём magic-link.</p>

        {checkEmail ? (
          <div className="mt-6 panel p-4 text-sm">
            Ссылка отправлена. Проверьте почту.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 flex flex-col gap-3">
            <input
              type="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com" className="input"
            />
            {error && <div className="text-red-400 text-sm">{error}</div>}
            <button className="btn" disabled={loading || !email}>
              {loading ? "Отправляю…" : "Получить ссылку"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
