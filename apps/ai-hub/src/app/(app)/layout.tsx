import { Header } from "@/components/Header";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Header />
      <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}
