import { AUTH_DISABLED } from '@/lib/auth';
import { SignIn } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

export default function SignInPage() {
  if (AUTH_DISABLED) redirect('/dashboard');
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignIn />
    </main>
  );
}
