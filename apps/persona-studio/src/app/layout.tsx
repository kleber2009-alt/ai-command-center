import "./globals.css";
import type { Metadata } from "next";
import { TopBar } from "@/components/top-bar";

export const metadata: Metadata = {
  title: "Persona Studio — AI content from your face in 2 minutes",
  description:
    "Upload one photo. Get 10 AI avatars. Turn them into viral covers and talking-head videos. Built on Nano Banana 2 and HeyGen.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink-950 text-ink-200 font-sans">
        <TopBar />
        <main>{children}</main>
      </body>
    </html>
  );
}
