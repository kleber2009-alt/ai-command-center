/**
 * Course content management (spec 6): fill, update and translate all 112
 * course items + 3 free items + the case, across 6 locales. The interactive
 * grid + per-locale editor lives in ContentEditor (client) and talks to
 * /api/admin/items.
 */
import { TOTAL_DAYS, ITEMS_PER_DAY } from '@/lib/engine/levels';
import { LOCALES } from '@/lib/types';
import { ContentEditor } from './ContentEditor';

export default function ContentPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Контент курса</h1>
      <p className="mb-6 text-sm text-neutral-500">
        112 элементов = {TOTAL_DAYS} дней × {ITEMS_PER_DAY} элемента. Локали: {LOCALES.join(', ')}.
      </p>
      <ContentEditor />
    </div>
  );
}
