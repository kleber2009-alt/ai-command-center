import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "AI Creative Hub",
  description: "Единый AI-кабинет для создания контента, рекламы и Reels. Image · Video · Voice — за единые токены.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
