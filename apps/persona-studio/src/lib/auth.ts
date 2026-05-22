import NextAuth, { type NextAuthConfig } from 'next-auth';
import { PrismaAdapter } from '@auth/prisma-adapter';
import Nodemailer from 'next-auth/providers/nodemailer';
import Google from 'next-auth/providers/google';
import { prisma } from './prisma';

const providers: NextAuthConfig['providers'] = [];

if (process.env.EMAIL_SERVER_HOST) {
  providers.push(
    Nodemailer({
      server: {
        host: process.env.EMAIL_SERVER_HOST,
        port: Number(process.env.EMAIL_SERVER_PORT ?? 1025),
        auth: process.env.EMAIL_SERVER_USER
          ? {
              user: process.env.EMAIL_SERVER_USER,
              pass: process.env.EMAIL_SERVER_PASSWORD,
            }
          : undefined,
      },
      from: process.env.EMAIL_FROM ?? 'noreply@persona-studio.local',
    }),
  );
}

if (process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET) {
  providers.push(
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
    }),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  trustHost: true,
  session: { strategy: 'database' },
  pages: {
    signIn: '/sign-in',
  },
  providers,
  callbacks: {
    async session({ session, user }) {
      if (session.user && user) {
        (session.user as { id: string }).id = user.id;
      }
      return session;
    },
  },
  events: {
    async createUser({ user }) {
      const bonus = Number(process.env.SIGNUP_BONUS_TOKENS ?? 10);
      if (!user.id || bonus <= 0) return;
      await prisma.user.update({
        where: { id: user.id },
        data: { tokenBalance: { increment: bonus } },
      });
      await prisma.tokenTransaction.create({
        data: {
          userId: user.id,
          amount: bonus,
          type: 'signup_bonus',
          reason: 'welcome',
        },
      });
    },
  },
});

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user) return null;
  const uid = (session.user as { id?: string }).id;
  if (!uid) return null;
  return prisma.user.findUnique({ where: { id: uid } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error('UNAUTHORIZED');
  return user;
}

/**
 * Принимает или NextAuth-сессию (cookie), или Bearer-токен в Authorization-заголовке.
 * Используется во всех публичных API-эндпоинтах, чтобы один и тот же URL работал
 * и для UI-пользователя, и для внешнего интегратора через SDK.
 *
 * Header формат: `Authorization: Bearer ps_<plaintext>`
 *
 * Возвращает { user, viaApiKey } или null если auth не прошла.
 * Если ключ найден — фоновое обновление lastUsedAt (без await).
 */
export async function getCurrentUserOrApiKey(req: { headers: Headers }) {
  const authz = req.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(ps_[A-Za-z0-9_-]{16,})$/.exec(authz);
  if (match) {
    const plaintext = match[1];
    const { createHash } = await import('node:crypto');
    const hashedKey = createHash('sha256').update(plaintext).digest('hex');
    const key = await prisma.apiKey.findUnique({
      where: { hashedKey },
      include: { user: true },
    });
    if (!key || key.revokedAt) return null;
    // fire-and-forget — не блокируем запрос
    void prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    return { user: key.user, viaApiKey: true as const, scopes: key.scopes.split(',') };
  }
  const user = await getCurrentUser();
  if (!user) return null;
  return { user, viaApiKey: false as const, scopes: ['read', 'write'] };
}

export async function getCurrentAdmin() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return null;
  return user;
}

export async function requireAdmin() {
  const admin = await getCurrentAdmin();
  if (!admin) throw new Error('FORBIDDEN');
  return admin;
}
