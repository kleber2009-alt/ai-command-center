import { serviceClient } from '@/lib/supabase/server';
import { TOTAL_COURSE_ITEMS } from '@/lib/engine/levels';

/**
 * Admin dashboard (spec 6). High-level health: content completeness, users,
 * leads and the email->purchase conversion rate.
 */
export const dynamic = 'force-dynamic';

async function getStats() {
  try {
    const db = serviceClient();
    const [{ count: courseItems }, { count: users }, { count: leads }, { count: buyers }] = await Promise.all([
      db.from('cdd_items').select('*', { count: 'exact', head: true }).eq('kind', 'course'),
      db.from('cdd_users').select('*', { count: 'exact', head: true }).eq('status', 'active'),
      db.from('cdd_users').select('*', { count: 'exact', head: true }).in('status', ['lead', 'active']),
      db.from('cdd_purchases').select('*', { count: 'exact', head: true }).eq('product', 'course_access').eq('status', 'active'),
    ]);
    return { courseItems: courseItems ?? 0, users: users ?? 0, leads: leads ?? 0, buyers: buyers ?? 0 };
  } catch {
    return null;
  }
}

export default async function Dashboard() {
  const stats = await getStats();
  const conversion = stats && stats.leads > 0 ? ((stats.buyers / stats.leads) * 100).toFixed(1) : '—';

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Дашборд</h1>
      {!stats ? (
        <p className="text-sm text-neutral-500">
          Нет подключения к БД. Заполните SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY в .env.local.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Card label="Элементов курса" value={`${stats.courseItems} / ${TOTAL_COURSE_ITEMS}`} />
          <Card label="Активные юзеры" value={String(stats.users)} />
          <Card label="Лиды (всего)" value={String(stats.leads)} />
          <Card label="Конверсия E-mail→покупка" value={conversion === '—' ? '—' : `${conversion}%`} />
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="text-sm text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
