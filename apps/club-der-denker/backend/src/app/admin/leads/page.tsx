/**
 * Leads dashboard (spec 6): tabular overview of emails captured before the
 * offer, with the email->purchase conversion-rate analysis.
 */
import { serviceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

async function getLeads() {
  try {
    const db = serviceClient();
    const { data } = await db
      .from('cdd_users')
      .select('id, email, status, locale, created_at')
      .in('status', ['lead', 'active'])
      .order('created_at', { ascending: false })
      .limit(200);
    return data ?? [];
  } catch {
    return null;
  }
}

export default async function LeadsPage() {
  const leads = await getLeads();
  const total = leads?.length ?? 0;
  const converted = leads?.filter((l: any) => l.status === 'active').length ?? 0;
  const rate = total > 0 ? ((converted / total) * 100).toFixed(1) : '—';

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Лиды</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Всего: {total} · Конвертировано: {converted} · Конверсия: {rate === '—' ? '—' : `${rate}%`}
      </p>
      {!leads ? (
        <p className="text-sm text-neutral-500">Нет подключения к БД.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2">E-mail</th>
              <th>Статус</th>
              <th>Язык</th>
              <th>Создан</th>
            </tr>
          </thead>
          <tbody>
            {leads.map((l: any) => (
              <tr key={l.id} className="border-b border-neutral-100">
                <td className="py-2">{l.email}</td>
                <td>{l.status === 'active' ? 'Покупка' : 'Лид'}</td>
                <td>{l.locale}</td>
                <td>{new Date(l.created_at).toLocaleDateString('ru-RU')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
