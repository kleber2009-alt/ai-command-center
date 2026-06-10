// Streaming skeleton while the dashboard server component runs its DB queries
// (force-dynamic + ~15 queries) — without it the route shows a blank screen.
export default function DashboardLoading() {
  return (
    <div className="space-y-12 animate-pulse" aria-busy="true" aria-label="Загрузка дашборда">
      {/* hero */}
      <section className="hero-gradient border border-border-soft overflow-hidden">
        <div className="grid lg:grid-cols-[1.05fr_0.95fr]">
          <div className="p-8 lg:p-14 min-h-[420px] lg:min-h-[560px] flex flex-col justify-between">
            <div className="space-y-5">
              <div className="h-3 w-48 bg-border-soft" />
              <div className="h-12 w-72 bg-border-soft" />
              <div className="h-12 w-56 bg-border-soft" />
              <div className="h-4 w-80 max-w-full bg-border-soft" />
            </div>
            <div className="h-10 w-44 bg-border-soft" />
          </div>
          <div className="bg-bg-card min-h-[340px] lg:min-h-[560px]" />
        </div>
      </section>

      {/* stats row */}
      <section>
        <div className="h-4 w-56 bg-border-soft mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-border-soft border border-border-soft">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-bg-panel p-6 space-y-3">
              <div className="h-2.5 w-24 bg-border-soft" />
              <div className="h-10 w-14 bg-border-soft" />
            </div>
          ))}
        </div>
      </section>

      {/* feature cards */}
      <section>
        <div className="h-4 w-64 bg-border-soft mb-4" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-editorial p-6 min-h-[200px] flex flex-col justify-between">
              <div className="h-2.5 w-20 bg-border-soft" />
              <div className="space-y-3">
                <div className="h-5 w-full bg-border-soft" />
                <div className="h-5 w-2/3 bg-border-soft" />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* recent creations */}
      <section>
        <div className="h-4 w-52 bg-border-soft mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="card-editorial overflow-hidden">
              <div className="aspect-[4/5] bg-bg-card" />
              <div className="p-3 space-y-2">
                <div className="h-3.5 w-3/4 bg-border-soft" />
                <div className="h-2.5 w-1/2 bg-border-soft" />
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
