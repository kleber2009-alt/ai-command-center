/**
 * Community feed management (spec 6): create / edit / delete posts with
 * language, media files and audience-category targeting. Posts are
 * admin-authored only — the feed is read-only for users.
 *
 * Scaffold: wire to /api/admin/posts (CRUD + translations).
 */
export default function PostsPage() {
  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold">Лента сообщества</h1>
      <p className="mb-6 text-sm text-neutral-500">
        Публикации создаёт только администратор: текст, изображения, встроенные видео, категории и языки.
      </p>
      <div className="rounded-lg border border-dashed border-neutral-300 bg-white p-8 text-center text-sm text-neutral-400">
        Редактор публикаций — подключить к /api/admin/posts
      </div>
    </div>
  );
}
