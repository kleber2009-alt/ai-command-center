/**
 * User management (spec 6): status, purchase history, current progress,
 * manual block / unblock. Scaffold table — wire to /api/admin/users.
 */
import { serviceClient } from '@/lib/supabase/server';
import { UserActions } from './UserActions';

export const dynamic = 'force-dynamic';

async function getUsers() {
  try {
    const db = serviceClient();
    const { data } = await db
      .from('cdd_users')
      .select('id, email, status, level, items_completed, streak_days, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    return data ?? [];
  } catch {
    return null;
  }
}

export default async function UsersPage() {
  const users = await getUsers();
  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Пользователи</h1>
      {!users ? (
        <p className="text-sm text-neutral-500">Нет подключения к БД.</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500">
              <th className="py-2">E-mail</th>
              <th>Статус</th>
              <th>Уровень</th>
              <th>Прогресс</th>
              <th>Серия</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.id} className="border-b border-neutral-100">
                <td className="py-2">{u.email}</td>
                <td>{u.status}</td>
                <td>{u.level}</td>
                <td>{u.items_completed} / 112</td>
                <td>{u.streak_days}</td>
                <td className="py-2"><UserActions userId={u.id} status={u.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
