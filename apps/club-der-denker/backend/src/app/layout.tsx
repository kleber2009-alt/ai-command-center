import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Club Der Denker — Admin',
  description: 'Backend management for the Club Der Denker course engine',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
