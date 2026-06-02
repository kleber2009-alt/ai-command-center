/**
 * Course content management (spec 6): fill, update and translate all 112
 * course items + 3 free items + the case, across 6 locales.
 *
 * Scaffold: lists the 28 days × 4 slots grid. Wire the editor to
 * /api/admin/items (CRUD + translations) — see backend/README.md.
 */
import { TOTAL_DAYS, ITEMS_PER_DAY } from '@/lib/engine/levels';
import { LOCALES } from '@/lib/types';

export default function ContentPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Контент курса</h1>
      <p className="mb-6 text-sm text-neutral-500">
        112 элементов = {TOTAL_DAYS} дней × {ITEMS_PER_DAY} элемента. Локали: {LOCALES.join(', ')}.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: TOTAL_DAYS }, (_, i) => i + 1).map((day) => (
          <div key={day} className="rounded-lg border border-neutral-200 bg-white p-4">
            <div className="mb-2 text-sm font-medium">День {day}</div>
            <ul className="space-y-1 text-sm text-neutral-500">
              {Array.from({ length: ITEMS_PER_DAY }, (_, s) => s + 1).map((slot) => (
                <li key={slot}>Элемент {slot} — <span className="text-neutral-400">не заполнен</span></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
