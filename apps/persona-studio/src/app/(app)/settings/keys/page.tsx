import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ApiKeysManager } from '@/components/api-keys-manager';
import { PageHero } from '@/components/shell/page-hero';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'API-ключи — Persona Studio' };

export default async function ApiKeysPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/sign-in');

  const appUrl = process.env.AUTH_URL ?? 'https://persona-app.46-62-215-11.nip.io';

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
      <PageHero
        icon="keys"
        eyebrow="НАСТРОЙКИ · ИНТЕГРАЦИИ · API-КЛЮЧИ"
        title={
          <>
            Доступ из кода — <span className="italic text-gold">твоя студия как API.</span>
          </>
        }
        description="Ключи нужны для интеграции Persona Studio в сторонние приложения через SDK или прямые HTTP-вызовы. Один ключ = доступ ко всем данным аккаунта. Полный ключ показывается ровно один раз при создании — сохрани сразу."
        meta={
          <>
            <div className="label">SDK</div>
            <div className="font-mono text-gold text-[13px]">@persona-studio/sdk</div>
          </>
        }
      />

      <ApiKeysManager
        initialKeys={keys.map((k) => ({
          ...k,
          createdAt: k.createdAt.toISOString(),
          lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
          revokedAt: k.revokedAt?.toISOString() ?? null,
        }))}
      />

      <section className="grid gap-3 mt-2">
        <h2 className="flex items-center gap-3"><span className="sec-num">/02</span><span className="sec-title">Быстрый старт</span></h2>
        <pre className="panel !bg-black/30 p-5 text-[12.5px] font-mono text-text-dim overflow-x-auto leading-relaxed">
{`import { createPersonaClient } from '@persona-studio/sdk';

const ps = createPersonaClient({
  baseUrl: '${appUrl}',
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
        <p className="text-[12.5px] text-text-mute">
          Полная документация — в <code className="font-mono text-text-dim">apps/persona-studio/sdk/README.md</code>.
        </p>
      </section>
    </div>
  );
}
