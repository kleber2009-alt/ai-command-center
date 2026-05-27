import { AUTH_DISABLED } from '@/lib/auth';
import { TRPCProvider } from '@/lib/trpc';
import { ClerkProvider } from '@clerk/nextjs';
import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Viral Platform',
  description: 'AI viral short-form video, powered by an AI B-roll engine.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const tree = (
    <html lang="en" className="dark">
      <body>
        <TRPCProvider>{children}</TRPCProvider>
      </body>
    </html>
  );
  // Demo mode renders without Clerk so no publishable key is needed at build.
  return AUTH_DISABLED ? tree : <ClerkProvider>{tree}</ClerkProvider>;
}
