import { AUTH_DISABLED } from '@/lib/auth';
import { SignUp } from '@clerk/nextjs';
import { redirect } from 'next/navigation';

export default function SignUpPage() {
  if (AUTH_DISABLED) redirect('/dashboard');
  return (
    <main className="flex min-h-screen items-center justify-center">
      <SignUp />
    </main>
  );
}
