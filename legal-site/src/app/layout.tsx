import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Юридическая компания — защита бизнеса и частных лиц",
  description:
    "Юридическая помощь физическим лицам, бизнесу и сопровождение сделок. Оставьте заявку — свяжемся в течение часа.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
