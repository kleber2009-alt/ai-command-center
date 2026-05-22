import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ApiKeysManager } from '@/components/api-keys-manager';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'API keys — Persona Studio' };

export default async function ApiKeysPage() {
  const user = (await getCurrentUser())!;

  const keys = await prisma.apiKey.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      prefix: true,
      scopes: true,
      lastUsedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return (
    <div className="grid gap-8">
      <header>
        <div className="flex items-baseline gap-3 mb-4">
          <span className="sec-num">/00</span>
          <span className="sec-title">API keys</span>
          <span className="flex-1 border-b border-border translate-y-[-3px]" />
          <span className="mono text-[10px] tracking-widest uppercase text-text-mute">
            sdk · @persona-studio/sdk
          </span>
        </div>
        <p className="font-serif italic text-[14px] text-text-dim max-w-[60ch]">
          Ключи нужны для интеграции Persona Studio в сторонние приложения через SDK
          или прямые HTTP-вызовы. Один ключ = доступ ко всем данным аккаунта.
          Plaintext показывается ровно один раз при создании — сохрани его сразу.
        </p>
      </header>

      <ApiKeysManager
        initialKeys={keys.map((k) => ({
          ...k,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
        }))}
      />

      <section className="grid gap-3 mt-6">
        <h2 className="sec-title">Quickstart</h2>
        <pre className="bg-surface border border-border p-4 text-[12px] mono overflow-x-auto leading-relaxed">
{`import { createPersonaClient } from '@persona-studio/sdk';

const ps = createPersonaClient({
  baseUrl: 'https://persona-app.46-62-215-11.nip.io',
  apiKey:  process.env.PERSONA_API_KEY!,
});

const upload = await ps.uploadPhoto({ name: 'me.jpg', data: buf, type: 'image/jpeg' });
const job    = await ps.generateAvatars({ uploadId: upload.id });
const gen    = await ps.waitFor(() => ps.getAvatarGeneration(job.id));
const best   = gen.avatars.find(a => a.status === 'done')!;
const video  = await ps.createVideo({
  avatarId: best.id,
  script:   'Привет!',
  voiceId:  'ru-male-1',
});`}
        </pre>
        <p className="font-serif italic text-[12px] text-text-mute">
          Полная документация — в <code className="mono">apps/persona-studio/sdk/README.md</code>.
        </p>
      </section>
    </div>
  );
}
