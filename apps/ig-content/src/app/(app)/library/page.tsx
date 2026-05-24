import { createClient } from '@/lib/supabase/server'
import { LibraryManager, type LibraryRow } from '@/components/library-manager'

export const dynamic = 'force-dynamic'

export default async function LibraryPage() {
  const supabase = createClient()
  const { data } = await supabase
    .from('content_library')
    .select('id, type, source, topic, hook, cta, format, performance_score, created_at')
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">База знаний</h1>
        <p className="text-sm text-muted-foreground">
          Контент, референсы, офферы и отзывы, на которых учится агент. Опубликованный
          контент с метриками добавляется сюда автоматически.
        </p>
      </div>

      <LibraryManager initialItems={(data as LibraryRow[]) ?? []} />
    </div>
  )
}
