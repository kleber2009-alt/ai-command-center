import { AUTH_DISABLED } from '@/lib/auth';
import { SignInButton, SignedIn, SignedOut } from '@clerk/nextjs';
import { PLANS } from '@vp/shared';
import Link from 'next/link';

const ctaClass = 'rounded-lg bg-primary px-6 py-3 font-semibold text-white';

// Minimal MVP landing (§8.1): hero + plans + CTA.
export default function LandingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-20">
      <section className="text-center">
        <h1 className="text-5xl font-bold tracking-tight">
          Turn long videos into viral clips — with an AI B-roll engine.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
          Upload once. Get captioned, B-roll-enhanced 9:16 / 1:1 / 16:9 clips in minutes.
        </p>
        <div className="mt-10 flex justify-center gap-4">
          {AUTH_DISABLED ? (
            <Link href="/dashboard" className={ctaClass}>
              Open dashboard
            </Link>
          ) : (
            <>
              <SignedOut>
                <SignInButton mode="modal">
                  <button type="button" className={ctaClass}>
                    Get started free
                  </button>
                </SignInButton>
              </SignedOut>
              <SignedIn>
                <Link href="/dashboard" className={ctaClass}>
                  Open dashboard
                </Link>
              </SignedIn>
            </>
          )}
        </div>
      </section>

      <section className="mt-24 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {Object.entries(PLANS).map(([id, plan]) => (
          <div key={id} className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold capitalize">{id}</h3>
            <p className="mt-2 text-3xl font-bold">${plan.priceUsd}</p>
            <p className="mt-1 text-sm text-muted">{plan.credits} credits / month</p>
          </div>
        ))}
      </section>
    </main>
  );
}
